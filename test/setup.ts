import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Keep tests away from the real ~/.config/devclean/history.json.
process.env.XDG_CONFIG_HOME = mkdtempSync(join(tmpdir(), 'devclean-config-'));
