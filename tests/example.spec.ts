import { test, expect, Page, Request, Response } from '@playwright/test';
import avro from 'avsc';
import axios from 'axios';


let firedBeacons: string[] = [];
const baseURL = 'https://shopper.flipp.com/tag/html/staging';

export const validateAvro = async (
  schemaId: string,
  message: string,
  callback: (name: string) => void,
) => {
  const schema = await getSchemaById(schemaId);
  const schemaObj = JSON.parse(schema);
  const isValid = isAvroMessageValid(schema, message);
  if (isValid) {
    callback(schemaObj.name);
  }
  return isValid;
};

const isAvroMessageValid = (schema: string, message: string) => {
  try {
    const type = avro.parse(schema, { wrapUnions: true });
    type.toBuffer(message);
  } catch (e) {
    return false;
  }
  return true;
};

export const getSchemaById = async (
  schemaId: string,
): Promise<string> => {
  const schemaUrl = `https://schema-registry-stg.flippback.com/schemas/ids/${schemaId}`;
  const schemaReq = await axios(schemaUrl, {
    headers: { 'Content-Type': 'application/vnd.schemaregistry.v1+json' },
  });

  return schemaReq.data.schema;
};


const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const processBeacons = async (
  request: Request,
  callback: (name: string) => void,
) => {
  const requestBody = JSON.parse(decodeURIComponent(request.postData() ?? ''));
  requestBody.forEach(async body => {
    const { schemaId } = body.schemaInfo;
    const isValid = await validateAvro(schemaId, body, callback);
    expect(isValid).toBeTruthy();
  });
};

export const interceptBeacons = async (
  request: Request,
  callback: (name: string) => void,
) => {
  if (
    request.method() === 'POST' &&
    request.url().includes('/nativex-beacon/')
  ) {
    await processBeacons(request, callback);
  }
};

export const interceptResponse = async (response: Response) => {
  console.log('<<', response.status(), response.url());
  if (response.url().includes('adzerk.net/api/v2')) {
    const result = (await response.json()) as string;
    console.log(result);
  }
};

const isSomeBeaconName = async (
  request: Request,
  name: string,
): Promise<boolean> => {
  if (
    request.method() === 'POST' &&
    request.url().includes('/nativex-beacon/')
  ) {
    const requestBody = JSON.parse(
      decodeURIComponent(request.postData() ?? ''),
    );
    const { schemaId } = requestBody[0].schemaInfo;
    const schema = await getSchemaById(schemaId);
    const schemaObj = JSON.parse(schema);
    return schemaObj.name === name;
  }
  return false;
};

const addFiredBeacons = (name: string) => {
  firedBeacons.push(name);
};

test.beforeEach(async ({ page }) => {
  firedBeacons = [];
  await page.goto(
    baseURL + '/native.html?flipp-content-code=e2e-staging-sfml-native',
  );
});

const scrollToExperience = async (page: Page) => {
  await page.evaluate(() => {
    const contentElement = document.querySelector('#flipp-scroll-ad-content');
    const scrollTop = contentElement?.getBoundingClientRect().top ?? 0;
    window.scrollTo(0, scrollTop - 100);
  });
  expect(page.locator('#flipp-scroll-ad-content').isVisible).toBeTruthy();
  expect(page.locator('.SFMLWeb').isVisible).toBeTruthy();
};

test('scroll to experience', async ({ page }) => {
  page.on('request', request =>
    interceptBeacons(request, addFiredBeacons),
  );

  await scrollToExperience(page);

  await page.waitForRequest(r =>
    isSomeBeaconName(r, 'StorefrontEngagedVisitFlyer'),
  );

  // just in case if there is race condition between intercepting request and adding fired beacon to the list
  await sleep(100);

  expect(firedBeacons).toEqual(
    expect.arrayContaining([
      'AppInitialized',
      'ExperienceInViewFlyer',
      'StorefrontOpenFlyer',
      'StorefrontHeartbeatFlyer',
      'StorefrontHeartbeatFlyer',
      'StorefrontHeartbeatFlyer',
      'StorefrontEngagedVisitFlyer',
    ]),
  );
});
