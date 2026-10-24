/** Values playwright.config.ts reads from the local Supabase stack. */
function required(name: string) {
    const value = process.env[name];
    if (!value) throw new Error(`${name} is not set. Run E2E tests through playwright.config.ts.`);
    return value;
}

export const env = {
    baseURL: required("E2E_BASE_URL"),
    supabaseUrl: required("E2E_SUPABASE_URL"),
    supabaseSecretKey: required("E2E_SUPABASE_SECRET_KEY"),
    mailpitUrl: required("E2E_MAILPIT_URL"),
};
