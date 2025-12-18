export function getRequestTemplateArtifacts(): {
	template: string;
	runModelSnippet: string;
} {
	const template = `import axios, { AxiosRequestConfig, Method, AxiosInstance, AxiosResponse } from 'axios';

type TSObject = Record<string, any>;
type Code = string | number;

export type HttpConfig = {
  baseURL?: string;
  timeout?: number;
  withCredentials?: boolean;
  getAuthorization?: () => string | undefined;
  authWhiteList?: Array<string | RegExp>;
  unwrapResponse?: boolean;
  successCodes?: Code[];
  codeField?: string;
  messageField?: string;
  dataField?: string;
};

export const httpConfig: HttpConfig = {
  unwrapResponse: false,
  successCodes: [0, 200, '0', '200'],
  codeField: 'code',
  messageField: 'message',
  dataField: 'data',
};

function cloneObject<T extends TSObject>(obj: T): T {
  return Object.assign({}, obj);
}

function buildRestfulUrl(url: string, payload: TSObject): { url: string; params: TSObject } {
  const mapping = cloneObject(payload);
  const reg = /(\{[A-Za-z\\d_-]+\})/g;

  url.match(reg)?.forEach((parTemplate: string) => {
    const paramName = parTemplate.replace(/[{}]/g, '');
    const raw = mapping[paramName] ?? '';
    const param = encodeURIComponent(String(raw));
    url = url.replace(parTemplate, param);
    delete mapping[paramName];
  });

  return { url, params: mapping };
}

function buildQueryOnlyUrl(url: string, payload: TSObject): { url: string; params: TSObject } {
  const params = cloneObject(payload);
  url = url.replace(/\\/\\{[A-Za-z\\d_-]+\\}/g, '');
  return { url, params };
}

function shouldAttachAuth(url: string): boolean {
  const list = httpConfig.authWhiteList || [];
  if (list.length === 0) return true;
  return !list.some((rule) => {
    if (typeof rule === 'string') return url.includes(rule);
    return rule.test(url);
  });
}

function unwrapData(payload: any): any {
  if (!httpConfig.unwrapResponse) return payload;

  const codeField = httpConfig.codeField || 'code';
  const messageField = httpConfig.messageField || 'message';
  const dataField = httpConfig.dataField || 'data';
  const success = new Set<Code>(httpConfig.successCodes || [0, 200, '0', '200']);

  const code = payload?.[codeField];
  if (code === undefined || success.has(code)) {
    return payload?.[dataField];
  }

  const msg = payload?.[messageField] ?? 'Request failed';
  const err: any = new Error(String(msg));
  err.payload = payload;
  err.code = code;
  throw err;
}

function createClient(): AxiosInstance {
  const instance = axios.create({
    baseURL: httpConfig.baseURL,
    timeout: httpConfig.timeout,
    withCredentials: httpConfig.withCredentials,
  });

  instance.interceptors.request.use(
    (config) => {
      // TODO: 使用者可在此补充：traceId、tenant、语言、签名等
      const auth = httpConfig.getAuthorization?.();
      const url = String(config.url || '');
      if (auth && shouldAttachAuth(url)) {
        const headers: TSObject = Object.assign({}, (config.headers || {}) as any);
        if (headers.Authorization == null) headers.Authorization = auth;
        config.headers = headers as any;
      }
      return config;
    },
    (error) => Promise.reject(error)
  );

  instance.interceptors.response.use(
    (response) => {
      // TODO: 使用者可在此补充：统一 toast、登录态失效处理、业务码处理等
      return response;
    },
    (error) => {
      // TODO: 使用者可在此补充：网络错误提示、错误上报、重试等
      return Promise.reject(error);
    }
  );

  return instance;
}

const client = createClient();

async function doRequest<V>(cfg: AxiosRequestConfig): Promise<V> {
  const ret: AxiosResponse = await client(cfg);
  return unwrapData(ret.data) as V;
}

export default {
  async run<T, V>(
    url: string,
    method: Method = 'POST',
    payload?: T,
    axiosConfig?: AxiosRequestConfig
  ): Promise<V> {
    const cfg: AxiosRequestConfig = Object.assign(
      {},
      {
        method,
        url,
      },
      axiosConfig || {}
    );

    if (payload) {
      if (['POST', 'PUT', 'PATCH'].includes(String(method).toUpperCase())) {
        cfg.data = payload;
        return doRequest<V>(cfg);
      }

      const p = payload as unknown as TSObject;
      const hasRestfulPlaceholders = /\{[A-Za-z\\d_-]+\}/.test(url);

      if (!hasRestfulPlaceholders) {
        cfg.params = p;
        return doRequest<V>(cfg);
      }

      const q1 = buildQueryOnlyUrl(url, p);
      const cfgQueryFirst: AxiosRequestConfig = Object.assign({}, cfg, {
        url: q1.url,
        params: q1.params,
      });

      try {
        return await doRequest<V>(cfgQueryFirst);
      } catch (e: any) {
        const status = e?.response?.status;
        if (status !== 404 && status !== 405) throw e;

        const r2 = buildRestfulUrl(url, p);
        const cfgRestful: AxiosRequestConfig = Object.assign({}, cfg, {
          url: r2.url,
          params: r2.params,
        });
        return doRequest<V>(cfgRestful);
      }
    }

    return doRequest<V>(cfg);
  },
};
`;

	const runModelSnippet = `// run 模型（用于粘贴到你自己的 request 封装里）
type AnyObject = Record<string, any>;

function buildRestfulUrl(url: string, payload: AnyObject): { url: string; params: AnyObject } {
  const mapping: AnyObject = Object.assign({}, payload);
  const reg = /(\{[A-Za-z\d_-]+\})/g;

  url.match(reg)?.forEach((parTemplate: string) => {
    const paramName = parTemplate.replace(/[{}]/g, '');
    const raw = mapping[paramName] ?? '';
    const param = encodeURIComponent(String(raw));
    url = url.replace(parTemplate, param);
    delete mapping[paramName];
  });

  return { url, params: mapping };
}

function buildQueryOnlyUrl(url: string, payload: AnyObject): { url: string; params: AnyObject } {
  const params: AnyObject = Object.assign({}, payload);
  url = url.replace(/\/\{[A-Za-z\d_-]+\}/g, '');
  return { url, params };
}

// 约定：doRequest(cfg) 返回的就是你最终想拿到的值（例如 axiosResponse.data 或 unwrap 后的数据）
export async function run<T, V>(
  doRequest: (cfg: AnyObject) => Promise<V>,
  url: string,
  method: string = 'POST',
  payload?: T,
  axiosConfig?: AnyObject
): Promise<V> {
  const cfg: AnyObject = Object.assign(
    {},
    {
      method,
      url,
    },
    axiosConfig || {}
  );

  if (payload) {
    if (['POST', 'PUT', 'PATCH'].includes(String(method).toUpperCase())) {
      cfg.data = payload;
      return await doRequest(cfg);
    }

    const p = payload as unknown as AnyObject;
    const hasRestfulPlaceholders = /\{[A-Za-z\d_-]+\}/.test(url);

    if (!hasRestfulPlaceholders) {
      cfg.params = p;
      return await doRequest(cfg);
    }

    const q1 = buildQueryOnlyUrl(url, p);
    const cfgQueryFirst: AnyObject = Object.assign({}, cfg, {
      url: q1.url,
      params: q1.params,
    });

    try {
      return await doRequest(cfgQueryFirst);
    } catch (e: any) {
      const status = e?.response?.status;
      if (status !== 404 && status !== 405) throw e;

      const r2 = buildRestfulUrl(url, p);
      const cfgRestful: AnyObject = Object.assign({}, cfg, {
        url: r2.url,
        params: r2.params,
      });
      return await doRequest(cfgRestful);
    }
  }

  return await doRequest(cfg);
}
`;

	return { template, runModelSnippet };
}
