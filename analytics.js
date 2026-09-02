// PostHog product analytics for the My Friends showcase.
// One place to configure PostHog, plus a tiny track() helper the rest of the app calls.
//
// ── SETUP (one time) ────────────────────────────────────────────────────────
//   1. In PostHog → Settings → Project, copy your "Project API Key" (starts with `phc_`).
//   2. Paste it into POSTHOG_KEY below.
//   3. If your project is on EU cloud, change POSTHOG_HOST to https://eu.i.posthog.com
//      (self-hosted: use your own instance URL). US cloud is the default.
//
// Until a real key is set, analytics stays completely disabled (track() is a no-op),
// so this file is safe to commit and deploy exactly as-is. Local development
// (localhost / 127.0.0.1) is also never tracked, to keep production data clean.
import { getLang } from "./i18n.js";

// PostHog "Default project" (org Neo, US cloud). This is a client-side ingestion key,
// designed to be public in web pages — safe to commit. Swap it if you move projects.
const POSTHOG_KEY = "phc_qM9sUDgPSkTgo4byb5ftf7c75LPnbdqTNhzemMpZUTVU";
const POSTHOG_HOST = "https://us.i.posthog.com"; // EU cloud → "https://eu.i.posthog.com"

const KEY_LOOKS_REAL = /^phc_[A-Za-z0-9]{10,}$/.test(POSTHOG_KEY);
const IS_LOCAL = /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)$/.test(location.hostname);

let enabled = false;

if (KEY_LOOKS_REAL && !IS_LOCAL) {
  // Official PostHog web snippet: loads posthog-js from the CDN and queues any
  // capture() calls made before it finishes downloading.
  !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSurveysLoaded onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug getPageViewId captureTraceFeedback captureTraceMetric".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);

  window.posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    person_profiles: "identified_only", // anonymous showcase visitors: no person profiles created
    capture_pageview: true,             // gives us the "$pageview" = "landed" funnel step
    capture_pageleave: true
  });

  // Registered as a super property so EVERY event (including autocaptured $pageview)
  // is segmentable by the language the visitor is viewing.
  try { window.posthog.register({ app_language: getLang() }); } catch { /* non-fatal */ }
  enabled = true;
}

// Capture a custom event. No-op when analytics is disabled; never throws into the app.
export function track(event, properties = {}) {
  if (!enabled || !window.posthog) return;
  try {
    window.posthog.capture(event, properties);
  } catch { /* analytics must never break the UI */ }
}

// Keep the language super property in sync when the visitor switches language.
export function registerLanguage(lang) {
  if (!enabled || !window.posthog) return;
  try { window.posthog.register({ app_language: lang }); } catch { /* non-fatal */ }
}
