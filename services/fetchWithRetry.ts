import axios from "axios";

export default async function fetchWithRetry(
  url: string,
  retries = 3,
  delayMs = 500
): Promise<any | null> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await axios.get(url, {
        timeout: 10000,
        validateStatus: () => true, // handle manually
      });

      if (res.status >= 200 && res.status < 300) {
        return res.data;
      }

      console.warn(`⚠️ Attempt ${i + 1}: Status ${res.status}`);
    } catch (err: any) {
      console.warn(`⚠️ Attempt ${i + 1} failed:`, err?.message);
    }

    // 🔥 exponential delay
    const wait = delayMs * Math.pow(2, i);
    await new Promise((r) => setTimeout(r, wait));
  }

  console.error("❌ All retries failed for URL:", url);
  return null;
}