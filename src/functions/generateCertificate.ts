/* eslint-disable prefer-const */
import { APIGatewayProxyHandler } from 'aws-lambda';
import { S3 } from 'aws-sdk';
import chromium from 'chrome-aws-lambda';
import dayjs from 'dayjs';
import { readFileSync } from 'fs';
import { compile } from 'handlebars';
import { join } from 'path';

import { document } from '../utils/dynamodbClient';
import { UuidV4 } from '../utils/random-uuid';

interface ICreateCertificate {
  id?: string;
  name: string;
  grade: string;
}

interface ITemplate {
  id: string;
  name: string;
  grade: string;
  medal: string;
  date: string;
}

const compileTemplate = async (data: ITemplate) => {
  const filePath = join(process.cwd(), 'src', 'templates', 'certificate.hbs');

  const html = readFileSync(filePath, 'utf-8');

  return compile(html)(data);
};

export const handler: APIGatewayProxyHandler = async event => {
  let { id, name, grade } = JSON.parse(event.body) as ICreateCertificate;

  if (id) {
    const response = await document
      .query({
        TableName: 'users_certificate',
        KeyConditionExpression: 'id = :id',
        ExpressionAttributeValues: {
          ':id': id,
        },
      })
      .promise();

    const userAlreadyExits = response.Items[0];

    if (!userAlreadyExits) {
      await document
        .put({
          TableName: 'users_certificate',
          Item: {
            id,
            name,
            grade,
            created_at: 1609459200,
          },
        })
        .promise();
    }
  } else {
    id = UuidV4();
  }

  const medalPath = join(process.cwd(), 'src', 'templates', 'selo.png');
  const medal = readFileSync(medalPath, 'base64');

  const data: ITemplate = {
    name,
    id,
    date: dayjs(1671933959143).format('DD/MM/YYYY'),
    grade,
    medal,
  };

  const content = await compileTemplate(data);

  const browser = await chromium.puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath,
  });

  const page = await browser.newPage();

  await page.setContent(content);

  const pdf = await page.pdf({
    format: 'a4',
    landscape: true,
    printBackground: true,
    preferCSSPageSize: true,
    path: process.env.IS_OFFLINE ? './certificate.pdf' : null,
  });

  await browser.close();

  const s3 = new S3();

  await s3
    .putObject({
      Bucket: 'generator-certificate',
      Key: `${id}.pdf`,
      ACL: 'public-read',
      Body: pdf,
      ContentType: 'application/pdf',
    })
    .promise();

  return {
    statusCode: 201,
    body: JSON.stringify({
      message: 'Certificado criado com sucesso!',
      url: `https://generator-certificate.s3.amazonaws.com/${id}.pdf`,
    }),
  };
};
