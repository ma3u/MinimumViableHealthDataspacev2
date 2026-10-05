// load-tests/signin.js
// A real sign-in (#519, hypotheses 4 and 6): NextAuth's CSRF token, the
// redirect to Keycloak, the login form, and the callback that sets the
// session cookie. Keycloak and its database are the components under test;
// nothing here is forged.
//
// KC_USER and KC_PASSWORD name the demo user (jad/keycloak-realm.json seeds
// them with password = username). The cookies are cleared after each
// iteration, so every iteration is a full sign-in and not an SSO shortcut.
import http from "k6/http";
import { check } from "k6";
import { BASE_URL, TESTID, SLO_MS } from "./config.js";

const USER = __ENV.KC_USER || "researcher";
const PASSWORD = __ENV.KC_PASSWORD || USER;

function tagged(name) {
  return {
    headers: { "X-Load-Test": TESTID },
    tags: { name, kind: "signin", persona: USER },
  };
}

export function signin() {
  const jar = http.cookieJar();
  const started = Date.now();

  const csrf = http.get(
    `${BASE_URL}/api/auth/csrf`,
    tagged("GET /api/auth/csrf"),
  );
  const csrfToken = csrf.json("csrfToken");

  // NextAuth answers {url} with json=true instead of redirecting.
  const start = http.post(
    `${BASE_URL}/api/auth/signin/keycloak`,
    { csrfToken, callbackUrl: `${BASE_URL}/`, json: "true" },
    tagged("POST /api/auth/signin/keycloak"),
  );
  const authorizeUrl = start.json("url");

  // The authorize request lands on Keycloak's login page.
  const login = http.get(authorizeUrl, tagged("GET keycloak authorize"));
  const action = login.html().find("#kc-form-login").attr("action");

  let done = login;
  if (action) {
    // Follows the redirects: Keycloak → /api/auth/callback/keycloak → /.
    done = http.post(
      action,
      { username: USER, password: PASSWORD, credentialId: "" },
      tagged("POST keycloak login"),
    );
  }

  const session = http.get(
    `${BASE_URL}/api/auth/session`,
    tagged("GET /api/auth/session"),
  );
  const signedIn = session.status === 200 && !!session.json("user.email");
  check(
    { done, session, elapsed: Date.now() - started },
    {
      "login form found": () => !!action,
      "callback answered 200": (r) => r.done.status === 200,
      "session has a user": () => signedIn,
      [`sign-in under ${SLO_MS.signin} ms`]: (r) => r.elapsed < SLO_MS.signin,
    },
    { kind: "signin" },
  );

  // Next iteration signs in again: no NextAuth session, no Keycloak SSO.
  jar.clear(BASE_URL);
  if (action) jar.clear(action);
}
