import axios from 'axios';
import { API_BASE } from '../config';

axios.defaults.baseURL = API_BASE;
axios.defaults.withCredentials = true;

axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status;
    const code = error?.response?.data?.code;
    const originalConfig = error?.config as (typeof error.config & { _retryInvalidToken?: boolean }) | undefined;

    // If JWT in localStorage is stale, drop it and retry once so cookie-based session can still work.
    if (status === 401 && code === 'INVALID_TOKEN' && originalConfig && !originalConfig._retryInvalidToken) {
      originalConfig._retryInvalidToken = true;
      localStorage.removeItem('auth_token');
      if (originalConfig.headers) {
        delete originalConfig.headers.Authorization;
      }
      return axios(originalConfig);
    }

    return Promise.reject(error);
  }
);

export default axios;
