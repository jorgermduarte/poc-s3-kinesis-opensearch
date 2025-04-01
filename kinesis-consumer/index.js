const { KinesisClient, GetShardIteratorCommand, GetRecordsCommand } = require('@aws-sdk/client-kinesis');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { Client } = require('@opensearch-project/opensearch');
// import .env variables
const dotenv = require('dotenv');
dotenv.config();

// Configuration
const config = {
  kinesis: {
    region: process.env.AWS_REGION,
    endpoint: 'http://localhost:4566',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
  },
  s3: {
    region: process.env.AWS_REGION,
    endpoint: 'http://localhost:4566',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    },
    forcePathStyle: true
  },
  opensearch: {
    node: process.env.OPENSEARCH_ENDPOINT,
    auth: {
      username: 'admin',
      password: 'admin'
    }
  }
};

// Clients
const kinesisClient = new KinesisClient(config.kinesis);
const s3Client = new S3Client(config.s3);
const osClient = new Client(config.opensearch);

async function initOpenSearch() {
  try {
    const indexExists = await osClient.indices.exists({ index: 'files' });
    if (indexExists.statusCode !== 404) return;

    await osClient.indices.create({
      index: 'files',
      body: {
        mappings: {
          properties: {
            fileName: { type: 'text' },
            content: { type: 'text' },
            contentType: { type: 'keyword' },
            size: { type: 'integer' },
            timestamp: { type: 'date' },
            s3Location: { type: 'keyword' }
          }
        }
      }
    });

    await osClient.indices.create({
      index: 'products',
      body: {
        mappings: {
          properties: {
            id: { type: 'keyword' },
            name: { type: 'text' },
            description: { type: 'text' },
            price: { type: 'float' },
          }
        }
      }
    });

    console.log('Created OpenSearch index');
  } catch (error) {
    console.error('OpenSearch init error:', error);
  }
}

async function processRecord(record) {
  try {
    const payload = JSON.parse(Buffer.from(record.Data).toString('utf-8'));
    
    // Get file from S3
    const { Body } = await s3Client.send(new GetObjectCommand({
      Bucket: payload.bucket,
      Key: payload.key
    }));
    
    // Process file content
    const content = await streamToString(Body);
    
    // Index in OpenSearch
    await osClient.index({
      index: 'files',
      body: {
        fileName: payload.key,
        content: content,
        contentType: payload.contentType,
        size: payload.size,
        timestamp: payload.timestamp,
        s3Location: `s3://${payload.bucket}/${payload.key}`
      }
    });

    const productData = JSON.parse(content);

    await osClient.index({
      index: 'products',
      body: {
        id: productData.id,
        name: productData.name,
        description: productData.description,
        price: productData.price,
      }
    });
    
    console.log(`Indexed file: ${payload.key}`);
  } catch (error) {
    console.error('Processing error:', error);
  }
}

async function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });
}

async function main() {
  await initOpenSearch();
  
  // Get shard iterator
  let { ShardIterator } = await kinesisClient.send(
    new GetShardIteratorCommand({
      StreamName: process.env.KINESIS_STREAM_NAME,
      ShardId: 'shardId-000000000000',
      ShardIteratorType: 'LATEST'
    })
  );

  // Poll for records
  while (true) {
    const { Records, NextShardIterator } = await kinesisClient.send(
      new GetRecordsCommand({ ShardIterator })
    );

    if (Records.length > 0) {
      for (const record of Records) {
        await processRecord(record);
      }
    }

    ShardIterator = NextShardIterator;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

main().catch(console.error);