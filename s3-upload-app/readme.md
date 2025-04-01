# S3 Upload App with LocalStack and Kinesis

This project demonstrates how to create a file upload application that:
1. Uploads files to an S3 bucket
2. Triggers events to a Kinesis stream
3. Uses LocalStack to simulate AWS services locally

## Prerequisites

- Docker and Docker Compose
- Node.js (v14 or later)
- AWS CLI (for interacting with LocalStack)

## Setup Instructions

### 1. Start LocalStack

```bash
# Start LocalStack using Docker Compose
docker-compose up -d
```

### 2. Install Node.js dependencies

```bash
npm install
```

### 3. Start the application

```bash
npm start
```

The application will automatically create:
- An S3 bucket named `s3-upload-bucket`
- A Kinesis stream named `file-upload-stream`

## How to Use

1. Open a web browser and navigate to http://localhost:3000
2. Select a file using the file input
3. Click the "Upload to S3" button
4. View the upload result, including S3 and Kinesis details
5. Click "Check Kinesis Records" to see if your event was processed by Kinesis

## Testing the Application

### Manual Testing
- Upload files of different types and sizes
- Check Kinesis records to verify events are being triggered

### AWS CLI Testing
You can also use AWS CLI with the LocalStack endpoint to verify the operations:

```bash
# List S3 buckets
aws --endpoint-url=http://localhost:4566 s3 ls

# List objects in the bucket
aws --endpoint-url=http://localhost:4566 s3 ls s3://s3-upload-bucket

# Describe Kinesis stream
aws --endpoint-url=http://localhost:4566 kinesis describe-stream --stream-name file-upload-stream
```

## How It Works

1. **File Upload**: When a file is uploaded through the web interface, it's sent to the Express.js server.
2. **S3 Storage**: The server uses the AWS SDK to upload the file to the S3 bucket in LocalStack.
3. **Kinesis Event**: After successful S3 upload, an event is sent to Kinesis with metadata about the uploaded file.
4. **Verification**: The "Check Kinesis Records" button retrieves records from the Kinesis stream to verify the event flow.

## Extending the Application

You can extend this application by adding:
- Lambda function consumers for the Kinesis stream
- Additional metadata or processing of uploaded files
- Authentication mechanisms
- Support for larger file uploads