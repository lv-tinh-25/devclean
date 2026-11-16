import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Keep tests away from the real ~/.config and ~/.cache.
process.env.XDG_CONFIG_HOME = mkdtempSync(join(tmpdir(), 'devclean-config-'));
process.env.XDG_CACHE_HOME = mkdtempSync(join(tmpdir(), 'devclean-cache-'));
