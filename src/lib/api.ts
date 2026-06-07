import axios from 'axios';

const getApiBaseUrl = () => {
    const hostname = window.location.hostname;
    const isSystemDomain = hostname.includes('localhost') || 
                           hostname.includes('127.0.0.1') || 
                           hostname.includes('run.app') || 
                           hostname.includes('itconflict.xyz') || 
                           hostname.startsWith('ais-');

    if (!isSystemDomain) {
        // standalone index.html uploaded on client's custom external hosting
        // route to the central backend application server on our system
        return 'https://ais-pre-7jtmrho2b67k3iysi7hvgy-899285028280.asia-southeast1.run.app/api';
    }
    return '/api';
};

export const api = axios.create({
    baseURL: getApiBaseUrl()
});

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('accessToken');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    const tenantId = localStorage.getItem('tenantId');
    if (tenantId) {
        config.headers['X-Tenant-ID'] = tenantId;
    }
    return config;
});
