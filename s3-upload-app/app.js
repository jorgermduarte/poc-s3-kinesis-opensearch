// app.js
const express = require('express');
const multer = require('multer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { KinesisClient, PutRecordCommand, GetShardIteratorCommand, GetRecordsCommand  } = require('@aws-sdk/client-kinesis');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

// AWS configuration for LocalStack
const awsConfig = {
  region: 'us-east-1',
  endpoint: 'http://localhost:4566',
  credentials: {
    accessKeyId: 'test',
    secretAccessKey: 'test'
  },
  forcePathStyle: true
};

// Initialize S3 and Kinesis clients
const s3Client = new S3Client(awsConfig);
const kinesisClient = new KinesisClient(awsConfig);

// Set up bucket and Kinesis stream names
const BUCKET_NAME = 's3-upload-bucket';
const KINESIS_STREAM_NAME = 'file-upload-stream';

// Routes
app.post('/kinesis/s3/files', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const fileContent = fs.readFileSync(req.file.path);
    const fileName = req.file.originalname;
    
    // Upload file to S3
    const s3Params = {
      Bucket: BUCKET_NAME,
      Key: fileName,
      Body: fileContent,
      ContentType: req.file.mimetype
    };

    const s3Result = await s3Client.send(new PutObjectCommand(s3Params));

    // Send event to Kinesis
    const kinesisParams = {
      StreamName: KINESIS_STREAM_NAME,
      Data: Buffer.from(JSON.stringify({
        bucket: BUCKET_NAME,
        key: fileName,
        size: req.file.size,
        contentType: req.file.mimetype,
        timestamp: new Date().toISOString()
      })),
      PartitionKey: `upload-${Date.now()}`
    };
    
    const kinesisResult = await kinesisClient.send(new PutRecordCommand(kinesisParams));
    
    // Clean up the uploaded file
    fs.unlinkSync(req.file.path);
    
    res.status(200).json({
      message: 'File uploaded successfully',
      s3: {
        bucket: BUCKET_NAME,
        key: fileName,
        url: `http://localhost:4566/s3-upload-bucket/${fileName}`
      },
      kinesis: {
        streamName: KINESIS_STREAM_NAME,
        shardId: kinesisResult.ShardId,
        sequenceNumber: kinesisResult.SequenceNumber
      }
    });
  } catch (error) {
    console.error('Error processing upload:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Add a route to check Kinesis records
app.get('/kinesis/records', async (req, res) => {
  try {
    // 1. Get shard iterator
    const shardIteratorParams = {
      StreamName: KINESIS_STREAM_NAME,
      ShardId: 'shardId-000000000000',
      ShardIteratorType: 'TRIM_HORIZON'
    };

    const { ShardIterator } = await kinesisClient.send(
      new GetShardIteratorCommand(shardIteratorParams)
    );

    if (!ShardIterator) {
      return res.status(404).json({ error: 'Shard iterator not found' });
    }

    // 2. Get records using the shard iterator
    const recordsParams = { ShardIterator };
    const { Records } = await kinesisClient.send(
      new GetRecordsCommand(recordsParams)
    );

    // 3. Convert records from Uint8Array to string
    const formattedRecords = Records.map(record => ({
      data: Buffer.from(record.Data).toString('utf-8'),
      sequenceNumber: record.SequenceNumber,
      approximateArrivalTimestamp: record.ApproximateArrivalTimestamp
    }));

    res.json({ records: formattedRecords });
  } catch (error) {
    console.error('Kinesis error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch Kinesis records',
      details: error.message
    });
  }
});

// display the .json samples files from the public folder
app.get('/json-samples', (req, res) => {
  const jsonFiles = fs.readdirSync(path.join(__dirname, 'public', 'json-samples')).filter(file => file.endsWith('.json'));
  res.json(jsonFiles);
});

// Start the server
app.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`);
});