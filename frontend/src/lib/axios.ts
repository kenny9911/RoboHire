import axios from 'axios';
import { API_BASE } from '../config';

// Set the base URL for all axios requests so
// /api/v1/... resolves to the backend in production
axios.defaults.baseURL = API_BASE;

export default axios;
