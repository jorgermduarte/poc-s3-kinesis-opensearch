const { S3Client } = require('@aws-sdk/client-s3');
const { Client } = require('@opensearch-project/opensearch');
const { StandardRetryStrategy } = require("@aws-sdk/middleware-retry");
const { defaultProvider } = require("@aws-sdk/credential-provider-node");
const { KinesisClient, GetShardIteratorCommand, GetRecordsCommand, DescribeStreamCommand } = require('@aws-sdk/client-kinesis');
const { NodeHttpHandler } = require('@smithy/node-http-handler'); // Added HTTP handler

const http = require('http');
const dotenv = require('dotenv');
dotenv.config();

const config = {
  kinesis: {
    region: process.env.AWS_REGION,
    endpoint: 'http://localhost:4566',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    },
    retryStrategy: new StandardRetryStrategy(
      defaultProvider(),
      {
        maxAttempts: 5, // Increase retry attempts
        retryDelay: 3000, // Add delay between retries
      }
    ),
    requestHandler: new NodeHttpHandler({ http2: false }), // Force HTTP/1.1
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
    ssl: {
      rejectUnauthorized: false,
    },
    agent: {
      http: new http.Agent({ keepAlive: true })
    },
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
    const indexExists = await osClient.indices.exists({ index: 'products' });
    if (indexExists.statusCode !== 404) return;

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

    console.log('Created OpenSearch index for products');
  } catch (error) {
    console.error('OpenSearch init error:', error);
  }
}
async function processRecord(record) {
  try {
    const payload = Buffer.from(record.Data).toString('utf-8');
    const parsedOnce = JSON.parse(payload); // Could be a string
    const productData = typeof parsedOnce === 'string' ? JSON.parse(parsedOnce) : parsedOnce;
    const { id, name } = productData;

    await osClient.index({
      index: 'products',
      body: productData
    });

    console.log(`Indexed product: ${id} - ${name}`);
  } catch (error) {
    console.error('Processing Index for product:', error.message);
  }
}

async function main() {
  await initOpenSearch();
  const streamName = process.env.KINESIS_STREAM_NAME;

  try {
    const { StreamDescription } = await kinesisClient.send(
      new DescribeStreamCommand({ StreamName: streamName })
    );
    const shardId = StreamDescription.Shards[0].ShardId;

    let ShardIterator = (await kinesisClient.send(
      new GetShardIteratorCommand({
        StreamName: streamName,
        ShardId: shardId,
        ShardIteratorType: 'LATEST'
      })
    )).ShardIterator;

    while (true) {
      try {
        const { Records, NextShardIterator } = await kinesisClient.send(
          new GetRecordsCommand({ ShardIterator })
        );

        if (Records?.length) {
          await Promise.all(Records.map(processRecord));
        }

        ShardIterator = NextShardIterator;
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error('GetRecords error:', error.message);
        await new Promise(resolve => setTimeout(resolve, 3000)); // Backoff on error
      }
    }
  } catch (error) {
    console.error('Fatal error:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);