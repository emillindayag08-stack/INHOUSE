import { createContext, useContext, useState, useCallback } from "react";
import { api } from "../api/client.js";

const AuthContext = createContext(null);

// Browsers a staff member chose to trust for 3 days: the server hands back a
// device token after the emailed code, kept here per account and sent with the
// next sign-in so the code is skipped.
const DEVICES_KEY = "codi_trusted_devices_v1";
const readDevices = () => {
  try {
    return JSON.parse(localStorage.getItem(DEVICES_KEY) || "{}");
  } catch {
    return {};
  }
};
const writeDevices = (devices) => {
  try {
    localStorage.setItem(DEVICES_KEY, JSON.stringify(devices));
  } catch {
    // storage blocked: the browser simply isn't remembered
  }
};
const deviceKey = (email) => String(email).trim().toLowerCase();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem("codi_user_v2");
    return stored ? JSON.parse(stored) : null;
  });

  const complete = useCallback((data, email) => {
    localStorage.setItem("codi_token_v2", data.token);
    localStorage.setItem("codi_user_v2", JSON.stringify(data.user));
    if (data.deviceToken) writeDevices({ ...readDevices(), [deviceKey(email)]: data.deviceToken });
    setUser(data.user);
    return data.user;
  }, []);

  // Returns the user, or — when the account needs an emailed code — an object
  // with `mfaRequired` and the challenge to finish with verifyMfa().
  // privacy: the privacy-notice acknowledgment and identification details
  // (see lib/privacyNotice.js) — the server refuses a sign-in without them.
  const login = useCallback(
    async (email, password, privacy) => {
      const deviceToken = readDevices()[deviceKey(email)];
      const { data } = await api.post("/auth/login", { email, password, deviceToken, privacy });
      if (data.mfaRequired) return data;
      return complete(data, email);
    },
    [complete]
  );

  const verifyMfa = useCallback(
    async (email, challengeId, code, trustDevice) => {
      const { data } = await api.post("/auth/mfa/verify", { challengeId, code, trustDevice });
      return complete(data, email);
    },
    [complete]
  );

  const resendMfa = useCallback(async (challengeId) => {
    const { data } = await api.post("/auth/mfa/resend", { challengeId });
    return data;
  }, []);

  // The code emailed when an account locks. Unlocks it; signing in still needs the password.
  const unlockAccount = useCallback(async (email, code) => {
    await api.post("/auth/unlock", { email, code });
  }, []);

  const forgetTrustedDevices = useCallback(async () => {
    await api.post("/auth/mfa/forget-devices");
    writeDevices({});
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("codi_token_v2");
    localStorage.removeItem("codi_user_v2");
    setUser(null);
  }, []);

  const updateProfile = useCallback(async (payload) => {
    const { data } = await api.patch("/auth/me", payload);
    localStorage.setItem("codi_user_v2", JSON.stringify(data));
    setUser(data);
    return data;
  }, []);

  const changePassword = useCallback(async (currentPassword, newPassword) => {
    await api.patch("/auth/change-password", { currentPassword, newPassword });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        verifyMfa,
        resendMfa,
        unlockAccount,
        forgetTrustedDevices,
        logout,
        updateProfile,
        changePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
