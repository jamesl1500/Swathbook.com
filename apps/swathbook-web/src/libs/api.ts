/**
 * api.ts
 * 
 * API-related utilities for the application, will be mainly using axios
 * 
 * @module src/libs/api
 * @description Provides access to API-related utilities for the application.
 * @since 1.0.0
 */

import axios from "axios";

/**
 * Axios instance configured for the application's API.
 */
export const api = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000",
});