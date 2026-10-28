import 'server-only';
import { graphError, summarizeFacebook, summarizeWhatsApp, type Provider, type Summary } from './integrationSpecs';

const GRAPH = 'https://graph.facebook.com/v23.0';

async function graphGet(path: string, token: string): Promise<{ ok: boolean; json: unknown; status: number }> {
  try {
    const res = await fetch(`${GRAPH}/${path}`, {
      headers: { authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(8000),
    });
    return { ok: res.ok, json: await res.json().catch(() => ({})), status: res.status };
  } catch {
    return { ok: false, json: { error: { message: 'تعذّر الوصول إلى خوادم Meta' } }, status: 0 };
  }
}

/** يختبر التوكن والمعرّفات فعلياً مقابل Graph API. لا يُسجَّل التوكن ولا يظهر في الأخطاء. */
export async function checkConnection(provider: Provider, config: Record<string, string>, token: string): Promise<Summary> {
  if (provider === 'whatsapp') {
    const r = await graphGet(`${encodeURIComponent(config.phone_number_id)}?fields=display_phone_number,verified_name,quality_rating`, token);
    if (!r.ok) return { ok: false, error: graphError(r.json, r.status) };
    const s = summarizeWhatsApp(r.json as Parameters<typeof summarizeWhatsApp>[0]);
    if (s.ok && config.waba_id) {
      const w = await graphGet(`${encodeURIComponent(config.waba_id)}?fields=name`, token);
      if (!w.ok) return { ok: false, error: `Business Account ID: ${graphError(w.json, w.status)}` };
    }
    return s;
  }
  const r = await graphGet(`${encodeURIComponent(config.page_id)}?fields=name,link`, token);
  if (!r.ok) return { ok: false, error: graphError(r.json, r.status) };
  return summarizeFacebook(r.json as Parameters<typeof summarizeFacebook>[0]);
}
