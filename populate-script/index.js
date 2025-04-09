
const { KinesisClient, PutRecordCommand } = require('@aws-sdk/client-kinesis');
const faker = require('@faker-js/faker');
const dotenv = require('dotenv');
dotenv.config();

const config = {
    kinesis: {
      region: process.env.AWS_REGION,
      endpoint: 'http://localhost:4566',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    }
};
const kinesisClient = new KinesisClient(config.kinesis);

const generateProduct = () => {
    const fake = faker.faker;
    let productName = fake.commerce.productName();
    let productDescription = fake.commerce.productDescription();

    // guarantee that the name does not contain any special characters
    productName = productName.replace(/[^a-zA-Z0-9 ]/g, '');
    productDescription = productDescription.replace(/[^a-zA-Z0-9 ]/g, '');

    const product = {
        id: fake.string.uuid(),
        name: productName,
        description: productDescription,
        price: parseFloat(fake.commerce.price()),
    };

    return product;


}

const sendKinesisEvent = async (product) => {
    const kinesisParams = {
        StreamName: process.env.KINESIS_STREAM_NAME,
        Data: Buffer.from(JSON.stringify(product)),
        PartitionKey: `${product.name}` // guarantees that all records with the same partition key are sent to the same shard
    };
    // send the message to the s3 bucket too

    const kinesisResult = await kinesisClient.send(new PutRecordCommand(kinesisParams));
    // console.log(`Sent event to Kinesis: ${JSON.stringify(product)}`);
    return kinesisResult;
}

const generateProducts = async (count) => {
    for (let i = 0; i < count; i++) {
        await sendKinesisEvent(generateProduct()).catch(err => console.error(`Error sending event: ${err}`));
    }
}

generateProducts(1000000).then(() => {
    console.log('Finished sending events to Kinesis');
}).catch(err => console.error(`${err}`));



