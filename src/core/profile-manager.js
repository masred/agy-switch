const fs = require('fs');
const path = require('path');
const config = require('../config');
const { copyFileAtomic, writeFileAtomic, safeUnlinkSync } = require('../utils/fs-atomic');
const { extractEmail, extractExpiry, hasRefreshToken } = require('./token-decoder');

class ProfileManager {
  constructor(customConfig = null) {
    this.cfg = customConfig || config;
    config.ensureDirectories(this.cfg);
  }

  validateProfileName(name) {
    if (!name || typeof name !== 'string') {
      throw new Error('Profile name is required.');
    }
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error('Profile name is required.');
    }
    if (trimmed.startsWith('.') || trimmed.startsWith('-')) {
      throw new Error(`Profile name cannot start with '.' or '-'.`);
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      throw new Error(`Invalid profile name '${name}'. Profile names must contain only letters, numbers, hyphens, or underscores.`);
    }
    if (trimmed.length > 64) {
      throw new Error('Profile name must not exceed 64 characters.');
    }
    const reserved = ['acp', 'active_profile', 'pending_profile', 'backup'];
    if (reserved.includes(trimmed.toLowerCase())) {
      throw new Error(`'${trimmed}' is a reserved name and cannot be used as a profile name.`);
    }
    return trimmed;
  }

  resolveProfilePath(baseDir, name) {
    const validName = this.validateProfileName(name);
    const resolvedBase = path.resolve(baseDir);
    const resolvedPath = path.resolve(resolvedBase, validName);
    if (!resolvedPath.startsWith(resolvedBase + path.sep)) {
      throw new Error(`Path traversal attempt detected with name '${name}'.`);
    }
    return resolvedPath;
  }

  getPending() {
    try {
      if (fs.existsSync(this.cfg.PENDING_FILE)) {
        const content = fs.readFileSync(this.cfg.PENDING_FILE, 'utf8').trim();
        return content || null;
      }
    } catch (_) {}
    return null;
  }

  /**
   * Consolidated single-pass state loader and synchronizer.
   * Eliminates redundant synchronous disk I/O.
   */
  loadState() {
    config.ensureDirectories(this.cfg);

    let authRaw = null;
    let authData = null;
    let authRefresh = null;

    if (fs.existsSync(this.cfg.AUTH_FILE)) {
      try {
        authRaw = fs.readFileSync(this.cfg.AUTH_FILE, 'utf8');
        authData = JSON.parse(authRaw);
        authRefresh = authData?.token?.refresh_token || authData?.refresh_token || null;
      } catch (_) {}
    }

    // 1. Pending login sync (CLI & ACP)
    if (fs.existsSync(this.cfg.PENDING_FILE) && authRaw) {
      try {
        const pendingName = fs.readFileSync(this.cfg.PENDING_FILE, 'utf8').trim();
        if (pendingName) {
          const targetPath = this.resolveProfilePath(this.cfg.PROFILES_DIR, pendingName);
          writeFileAtomic(targetPath, authRaw, { mode: 0o600 });

          if (fs.existsSync(this.cfg.ACP_AUTH_FILE)) {
            const acpTarget = this.resolveProfilePath(this.cfg.ACP_PROFILES_DIR, pendingName);
            copyFileAtomic(this.cfg.ACP_AUTH_FILE, acpTarget, 0o600);
          }

          writeFileAtomic(this.cfg.ACTIVE_FILE, pendingName, { mode: 0o600 });
          safeUnlinkSync(this.cfg.PENDING_FILE);
        }
      } catch (_) {}
    }

    let savedActive = null;
    if (fs.existsSync(this.cfg.ACTIVE_FILE)) {
      try {
        savedActive = fs.readFileSync(this.cfg.ACTIVE_FILE, 'utf8').trim() || null;
      } catch (_) {}
    }

    let activeCandidate = null;
    const profiles = [];

    // Scan PROFILES_DIR in a single pass
    if (fs.existsSync(this.cfg.PROFILES_DIR)) {
      let files = [];
      try {
        files = fs.readdirSync(this.cfg.PROFILES_DIR).filter(f => !f.startsWith('.'));
      } catch (_) {}

      for (const f of files) {
        let fPath;
        try {
          fPath = path.join(this.cfg.PROFILES_DIR, f);
          const stat = fs.statSync(fPath);
          if (!stat.isFile()) continue;

          const pRaw = fs.readFileSync(fPath, 'utf8');
          let pData = null;
          try {
            pData = JSON.parse(pRaw);
          } catch (_) {}

          const pRefresh = pData?.token?.refresh_token || pData?.refresh_token;

          // Check if matches active auth token
          let isMatch = false;
          if (authRaw) {
            if (authRaw === pRaw) {
              isMatch = true;
              activeCandidate = f;
            } else if (authRefresh && pRefresh === authRefresh) {
              isMatch = true;
              activeCandidate = f;
              // Synchronize refreshed token to saved profile
              try {
                writeFileAtomic(fPath, authRaw, { mode: 0o600 });
                writeFileAtomic(this.cfg.ACTIVE_FILE, f, { mode: 0o600 });
              } catch (_) {}
            }
          }

          const acpPath = path.join(this.cfg.ACP_PROFILES_DIR, f);
          const hasAcp = fs.existsSync(acpPath);

          profiles.push({
            name: f,
            path: fPath,
            size: stat.size,
            mtime: stat.mtime,
            data: pData,
            email: extractEmail(pData),
            authMethod: pData?.auth_method || 'consumer',
            expiry: extractExpiry(pData),
            hasRefreshToken: hasRefreshToken(pData),
            hasAcp,
            isMatch,
          });
        } catch (_) {}
      }
    }

    // Determine final active profile
    let activeProfile = activeCandidate;
    if (!activeProfile && savedActive && profiles.some(p => p.name === savedActive)) {
      activeProfile = savedActive;
    }

    // ACP Token auto-capture & sync for active profile (verified refresh token matching)
    if (activeProfile && fs.existsSync(this.cfg.ACP_AUTH_FILE)) {
      try {
        const curAcpRaw = fs.readFileSync(this.cfg.ACP_AUTH_FILE, 'utf8');
        const curAcpData = JSON.parse(curAcpRaw);
        const curRef = curAcpData?.refresh_token || curAcpData?.token?.refresh_token;

        if (curAcpData && curRef) {
          const acpProfilePath = path.join(this.cfg.ACP_PROFILES_DIR, activeProfile);
          let shouldSync = false;

          if (!fs.existsSync(acpProfilePath)) {
            shouldSync = true;
          } else {
            const savedAcpRaw = fs.readFileSync(acpProfilePath, 'utf8');
            if (curAcpRaw !== savedAcpRaw) {
              const savedAcpData = JSON.parse(savedAcpRaw);
              const savedRef = savedAcpData?.refresh_token || savedAcpData?.token?.refresh_token;
              // Only sync if refresh token matches (healing refreshed access token)
              if (savedRef && curRef && savedRef === curRef) {
                shouldSync = true;
              }
            }
          }

          if (shouldSync) {
            writeFileAtomic(acpProfilePath, curAcpRaw, { mode: 0o600 });
          }
        }
      } catch (_) {}
    }

    // Attach active boolean
    for (const p of profiles) {
      p.active = p.name === activeProfile;
    }

    profiles.sort((a, b) => a.name.localeCompare(b.name));

    return {
      profiles,
      active: activeProfile,
      pending: this.getPending(),
      hasUnsavedActive: Boolean(fs.existsSync(this.cfg.AUTH_FILE) && !activeProfile),
    };
  }

  getProfiles() {
    return this.loadState();
  }

  getActiveProfile() {
    return this.loadState().active;
  }

  sync() {
    return this.loadState();
  }

  switchProfile(name) {
    const targetPath = this.resolveProfilePath(this.cfg.PROFILES_DIR, name);
    if (!fs.existsSync(targetPath)) {
      throw new Error(`Profile '${name}' not found.`);
    }

    // Auto-backup current unsaved session to avoid accidental data loss
    const { hasUnsavedActive } = this.loadState();
    if (hasUnsavedActive && fs.existsSync(this.cfg.AUTH_FILE)) {
      const now = new Date();
      const pad = n => String(n).padStart(2, '0');
      const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      const backupName = `backup-${timestamp}`;
      const backupPath = path.join(this.cfg.PROFILES_DIR, backupName);
      copyFileAtomic(this.cfg.AUTH_FILE, backupPath, 0o600);

      if (fs.existsSync(this.cfg.ACP_AUTH_FILE)) {
        const acpBackup = path.join(this.cfg.ACP_PROFILES_DIR, backupName);
        copyFileAtomic(this.cfg.ACP_AUTH_FILE, acpBackup, 0o600);
      }
    }

    safeUnlinkSync(this.cfg.PENDING_FILE);

    // 1. Switch CLI token atomically
    copyFileAtomic(targetPath, this.cfg.AUTH_FILE, 0o600);
    writeFileAtomic(this.cfg.ACTIVE_FILE, name, { mode: 0o600 });

    // 2. Switch ACP token atomically
    const acpTarget = this.resolveProfilePath(this.cfg.ACP_PROFILES_DIR, name);
    let hasAcp = false;

    if (fs.existsSync(acpTarget)) {
      copyFileAtomic(acpTarget, this.cfg.ACP_AUTH_FILE, 0o600);
      hasAcp = true;

      // Update bridge verified marker if state directory exists
      try {
        const bridgeDir = path.dirname(this.cfg.ACP_VERIFIED_FILE);
        if (fs.existsSync(bridgeDir)) {
          writeFileAtomic(
            this.cfg.ACP_VERIFIED_FILE,
            JSON.stringify({ verified: true, at: new Date().toISOString() }, null, 2) + '\n',
            { mode: 0o600 }
          );
        }
      } catch (_) {}
    } else {
      // Remove stale ACP token to avoid account mismatch
      safeUnlinkSync(this.cfg.ACP_AUTH_FILE);
      safeUnlinkSync(this.cfg.ACP_VERIFIED_FILE);
    }

    return { name, hasAcp };
  }

  addProfile(name) {
    const validName = this.validateProfileName(name);
    const targetPath = this.resolveProfilePath(this.cfg.PROFILES_DIR, validName);
    if (fs.existsSync(targetPath)) {
      throw new Error(`Profile '${validName}' already exists. Use 'agy-switch save ${validName}' to update it, or choose another name.`);
    }

    const { active, hasUnsavedActive } = this.loadState();

    // Auto-backup current unsaved session
    if (hasUnsavedActive && fs.existsSync(this.cfg.AUTH_FILE)) {
      const now = new Date();
      const pad = n => String(n).padStart(2, '0');
      const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      const backupName = `backup-${timestamp}`;
      const backupPath = path.join(this.cfg.PROFILES_DIR, backupName);
      copyFileAtomic(this.cfg.AUTH_FILE, backupPath, 0o600);

      if (fs.existsSync(this.cfg.ACP_AUTH_FILE)) {
        const acpBackup = path.join(this.cfg.ACP_PROFILES_DIR, backupName);
        copyFileAtomic(this.cfg.ACP_AUTH_FILE, acpBackup, 0o600);
      }
    }

    writeFileAtomic(this.cfg.PENDING_FILE, validName, { mode: 0o600 });
    safeUnlinkSync(this.cfg.AUTH_FILE);
    safeUnlinkSync(this.cfg.ACP_AUTH_FILE);
    safeUnlinkSync(this.cfg.ACP_VERIFIED_FILE);
    safeUnlinkSync(this.cfg.ACTIVE_FILE);

    return validName;
  }

  saveProfile(name) {
    const validName = this.validateProfileName(name);
    if (!fs.existsSync(this.cfg.AUTH_FILE)) {
      throw new Error(`Active session token (${this.cfg.AUTH_FILE}) does not exist. Please authenticate with agy first.`);
    }

    const targetPath = this.resolveProfilePath(this.cfg.PROFILES_DIR, validName);
    copyFileAtomic(this.cfg.AUTH_FILE, targetPath, 0o600);
    writeFileAtomic(this.cfg.ACTIVE_FILE, validName, { mode: 0o600 });

    let hasAcp = false;
    if (fs.existsSync(this.cfg.ACP_AUTH_FILE)) {
      const acpTarget = this.resolveProfilePath(this.cfg.ACP_PROFILES_DIR, validName);
      copyFileAtomic(this.cfg.ACP_AUTH_FILE, acpTarget, 0o600);
      hasAcp = true;
    }

    safeUnlinkSync(this.cfg.PENDING_FILE);
    return { name: validName, hasAcp };
  }

  deleteProfile(name) {
    const targetPath = this.resolveProfilePath(this.cfg.PROFILES_DIR, name);
    if (!fs.existsSync(targetPath)) {
      throw new Error(`Profile '${name}' does not exist.`);
    }

    safeUnlinkSync(targetPath);

    const acpTarget = path.join(this.cfg.ACP_PROFILES_DIR, name);
    safeUnlinkSync(acpTarget);

    // If deleting the active profile, clear active tokens to prevent ghost sessions
    let wasActive = false;
    if (fs.existsSync(this.cfg.ACTIVE_FILE)) {
      try {
        const saved = fs.readFileSync(this.cfg.ACTIVE_FILE, 'utf8').trim();
        if (saved === name) {
          wasActive = true;
          safeUnlinkSync(this.cfg.ACTIVE_FILE);
          safeUnlinkSync(this.cfg.AUTH_FILE);
          safeUnlinkSync(this.cfg.ACP_AUTH_FILE);
          safeUnlinkSync(this.cfg.ACP_VERIFIED_FILE);
        }
      } catch (_) {}
    }

    return { name, wasActive };
  }

  renameProfile(oldName, newName) {
    const oldPath = this.resolveProfilePath(this.cfg.PROFILES_DIR, oldName);
    const newPath = this.resolveProfilePath(this.cfg.PROFILES_DIR, newName);

    if (!fs.existsSync(oldPath)) {
      throw new Error(`Profile '${oldName}' does not exist.`);
    }
    if (fs.existsSync(newPath) && oldName !== newName) {
      throw new Error(`Profile '${newName}' already exists.`);
    }

    fs.renameSync(oldPath, newPath);

    const oldAcp = path.join(this.cfg.ACP_PROFILES_DIR, oldName);
    const newAcp = path.join(this.cfg.ACP_PROFILES_DIR, newName);
    if (fs.existsSync(oldAcp)) {
      try { fs.renameSync(oldAcp, newAcp); } catch (_) {}
    }

    if (fs.existsSync(this.cfg.ACTIVE_FILE)) {
      try {
        const saved = fs.readFileSync(this.cfg.ACTIVE_FILE, 'utf8').trim();
        if (saved === oldName) {
          writeFileAtomic(this.cfg.ACTIVE_FILE, newName, { mode: 0o600 });
        }
      } catch (_) {}
    }

    return newName;
  }

  saveAcpProfile(name = null) {
    const targetName = name ? this.validateProfileName(name) : this.getActiveProfile();
    if (!targetName) {
      throw new Error('No profile specified and no active profile detected.');
    }
    const profilePath = this.resolveProfilePath(this.cfg.PROFILES_DIR, targetName);
    if (!fs.existsSync(profilePath)) {
      throw new Error(`Profile '${targetName}' does not exist. Save the CLI profile first.`);
    }
    if (!fs.existsSync(this.cfg.ACP_AUTH_FILE)) {
      throw new Error(`Active ACP token (${this.cfg.ACP_AUTH_FILE}) does not exist. Run /agy auth in Pi first.`);
    }

    const targetPath = this.resolveProfilePath(this.cfg.ACP_PROFILES_DIR, targetName);
    copyFileAtomic(this.cfg.ACP_AUTH_FILE, targetPath, 0o600);
    return targetName;
  }
}

// Default singleton instance
const defaultManager = new ProfileManager();

module.exports = {
  ProfileManager,
  profileManager: defaultManager,
};
