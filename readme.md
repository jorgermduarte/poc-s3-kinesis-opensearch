# S3 File Upload with LocalStack and Kinesis Integration for OpenSearch

A local development environment demonstrating file uploads to S3 with mock trigger to Kinesis for event streaming using LocalStack.

## Features

- 📁 File upload to LocalStack S3 bucket
- 📨 Real-time event streaming with Kinesis
- 🐳 Dockerized LocalStack setup
- 📊 Web interface for file management
- 🔍 Kinesis record inspection
- 📦 Pre-configured AWS resources initialization
- 🧪 Sample JSON data handling

## Prerequisites

- Docker & Docker Compose
- Node.js 16+
- AWS CLI (optional)
## UI
![UI](./resources/s3-project.png)


# OpenSearch Integration
The Kinesis consumer service:
1. Continuously polls the Kinesis stream
2. Processes new file upload events
3. Retrieves files from S3
4. Indexes file content in OpenSearch

**Access OpenSearch:**
- Search API for files index: http://localhost:9200/files/_search
- Search API for products index: http://localhost:9200/products/_search


# Getting Started

## Executing the necessary services
```
  docker compose up localstack --build -d
  docker compose up localstack-init --build -d
  docker compose up opensearch --build -d
```

## Executing the Kinesis Consumer
```
  npm install
  npm start
```

## Executing the s3-upload-app
```
  npm install
  npm start
```

# S3 File submission

Before the submission and having all the services executed we can see that we don't have any data for the products index.
![Opensearch before file submission](./resources/products_index_before_s3_submission.png)

After the .json file submission to S3 and given the mock trigger to kinesis, we can verify that the product is added correctly.
![Opensearch after file submission](./resources/products_index_after_s3_submission.png)
