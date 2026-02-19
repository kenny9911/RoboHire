import axios from 'axios';
import { API_BASE } from '../config';

axios.defaults.baseURL = API_BASE;

axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default axios;
