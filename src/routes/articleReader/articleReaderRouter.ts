import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { Readability } from '@mozilla/readability';
import * as cheerio from 'cheerio';
import express, { Request, Response, Router } from 'express';
import got from 'got';
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

const fetchAndCleanContent = async (url: string) => {
  try {
    const { body } = await got(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Connection": "keep-alive",
        "Referer": "https://www.google.com"
      },
      timeout: 10000 // 10 segundos
    });

    // Verifica el contenido recibido
    console.log("Response body type:", typeof body);
    console.log("Response body content:", body ? body.slice(0, 100) : "No body"); // Solo muestra los primeros 100 caracteres

    const $ = cheerio.load(body);
    const title = $('title').text() || 'No title found';

    removeUnwantedElements($);

    const doc = new JSDOM($.html(), { url });
    const reader = new Readability(doc.window.document);
    const article = reader.parse();

    if (!article || !article.textContent) {
      throw new Error("Failed to extract article content: No valid content found.");
    }

    return { title, content: article.textContent.trim() };

  } catch (error) {
    console.error("Error in fetchAndCleanContent: ", error);
    throw error; // Re-lanza el error para ser manejado por el llamado del API
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
      return new ServiceResponse(ResponseStatus.Failed, 'URL must be a string', null, StatusCodes.BAD_REQUEST);
    }

    try {
      const content = await fetchAndCleanContent(url);
      const serviceResponse = new ServiceResponse(
        ResponseStatus.Success,
        'Service is healthy',
        content,
        StatusCodes.OK
      );
      handleServiceResponse(serviceResponse, res);
    } catch (error) {
      console.error(`Error fetching content ${(error as Error).message}`);
      const errorMessage = `Error fetching content ${(error as Error).message}`;
      return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
    }
  });

  return router;
})();
