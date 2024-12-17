import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { Readability } from '@mozilla/readability';
import * as cheerio from 'cheerio';
import express, { Request, Response, Router } from 'express';
import puppeteer from 'puppeteer';
import { StatusCodes } from 'http-status-codes';
import { JSDOM } from 'jsdom';

import { createApiResponse } from '@/api-docs/openAPIResponseBuilders';
import { ResponseStatus, ServiceResponse } from '@/common/models/serviceResponse';
import { handleServiceResponse } from '@/common/utils/httpHandlers';

import { ArticleReaderSchema } from './articleReaderModel';

export const articleReaderRegistry = new OpenAPIRegistry();
articleReaderRegistry.register('ArticleReader', ArticleReaderSchema);

const removeUnwantedElements = (_cheerio: any) => {
  const elementsToRemove = [
    'footer',
    'header',
    'nav',
    'script',
    'style',
    'link',
    'meta',
    'noscript',
    'img',
    'picture',
    'video',
    'audio',
    'iframe',
    'object',
    'embed',
    'param',
    'track',
    'source',
    'canvas',
    'map',
    'area',
    'svg',
    'math',
  ];

  elementsToRemove.forEach((element) => _cheerio(element).remove());
};

const fetchAndCleanContentWithPuppeteer = async (url: string) => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  try {
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 10000
    });

    const content = await page.content();
    const $ = cheerio.load(content);
    const title = $('title').text() || 'No title found';

    removeUnwantedElements($);

    const doc = new JSDOM($.html(), { url });
    const reader = new Readability(doc.window.document);
    const article = reader.parse();

    return { title, content: article ? article.textContent.trim() : '' };
  } catch (error) {
    console.error(`Error fetching content with Puppeteer: ${error.message}`);
    throw error;
  } finally {
    await browser.close();
  }
};

export const articleReaderRouter: Router = (() => {
  const router = express.Router();

  articleReaderRegistry.registerPath({
    method: 'get',
    path: '/content',
    tags: ['Article Reader'],
    responses: createApiResponse(ArticleReaderSchema, 'Success'),
  });

  router.get('/', async (_req: Request, res: Response) => {
    const { url } = _req.query;

    if (typeof url !== 'string') {
      const serviceResponse = new ServiceResponse(ResponseStatus.Failed, 'URL must be a string', null, StatusCodes.BAD_REQUEST);
      return handleServiceResponse(serviceResponse, res);
    }

    try {
      const content = await fetchAndCleanContentWithPuppeteer(url);
      const serviceResponse = new ServiceResponse(
        ResponseStatus.Success,
        'Service is healthy',
        content,
        StatusCodes.OK
      );
      handleServiceResponse(serviceResponse, res);
    } catch (error) {
      console.error(`Error fetching content: ${(error as Error).message}`);
      const errorMessage = `Error fetching content: ${(error as Error).message}`;
      const serviceResponse = new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
      handleServiceResponse(serviceResponse, res);
    }
  });

  return router;
})();
