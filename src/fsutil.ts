/**
 * Small filesystem utilities.
 * Glob matching, path expansion and recursive traversal, implemented without dependencies.
 */

import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import path from 'node:path'

/** Expands a leading `~` to the home directory. */
export function expandHome(targetPath: string): string {
  if (targetPath === '~') {
    return os.homedir()
  }
  return targetPath.startsWith('~/') || targetPath.startsWith('~\\')
    ? path.join(os.homedir(), targetPath.slice(2))
    : targetPath
}

/** Normalizes OS path separators to POSIX (`/`). */
export function toPosixPath(targetPath: string): string {
  return targetPath.split(path.sep).join('/')
}

/**
 * Recursively walks a directory and returns the relative paths (POSIX separators)
 * of files and symlinks, optionally including directories.
 * Missing entries abort traversal unless a missing root is explicitly allowed.
 * @param root Directory to walk (absolute path)
 * @param options Traversal options for optional destinations and directory protection
 * @param options.allowMissingRoot Whether an absent root is treated as empty
 * @param options.includeDirectories Whether directory paths are included in the result
 * @returns Paths relative to the root (POSIX separators)
 */
export async function walkFiles(
  root: string,
  options: { allowMissingRoot?: boolean; includeDirectories?: boolean } = {}
): Promise<string[]> {
  const result: string[] = []

  /** Recursively walks `dir`, appending to `result`. */
  async function walk(dir: string): Promise<void> {
    let entries: import('node:fs').Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch (error) {
      if (
        dir === root &&
        options.allowMissingRoot &&
        (error as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        return
      }
      throw error
    }

    for (const entry of entries) {
      const absolutePath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (options.includeDirectories) {
          result.push(toPosixPath(path.relative(root, absolutePath)))
        }
        await walk(absolutePath)
        continue
      }
      // Files and symlinks are included in the result
      result.push(toPosixPath(path.relative(root, absolutePath)))
    }
  }

  await walk(root)
  return result
}

/** Cache from glob pattern string to RegExp. */
const globRegExpCache = new Map<string, RegExp>()

/**
 * Converts a glob pattern (supporting `*`, `**` and `?`) to a RegExp.
 * Results are cached at module level to avoid recompiling the same pattern.
 * `**` matches any length including path separators, and `**\/` also allows zero directory levels.
 * `*` matches any length excluding path separators; `?` matches one character other than a path separator.
 * @param pattern Glob pattern
 * @returns Anchored (full-match) regular expression
 */
export function globToRegExp(pattern: string): RegExp {
  const cached = globRegExpCache.get(pattern)
  if (cached) {
    return cached
  }
  let regExpSource = ''
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i]
    if (char === '*') {
      if (pattern[i + 1] === '*') {
        if (pattern[i + 2] === '/') {
          // `**/` matches zero or more directory levels
          regExpSource += '(?:.*/)?'
          i += 2
        } else {
          // `**` matches any length, including path separators
          regExpSource += '.*'
          i += 1
        }
      } else {
        // `*` matches any length, excluding path separators
        regExpSource += '[^/]*'
      }
    } else if (char === '?') {
      regExpSource += '[^/]'
    } else if (/[.+^${}()|[\]\\]/.test(char)) {
      regExpSource += `\\${char}`
    } else {
      regExpSource += char
    }
  }
  const regexp = new RegExp(`^${regExpSource}$`)
  globRegExpCache.set(pattern, regexp)
  return regexp
}

/** Returns true if the path (POSIX separators) matches the glob pattern. */
export function matchGlob(pattern: string, targetPath: string): boolean {
  return globToRegExp(pattern).test(targetPath)
}

/** Returns true if the path (POSIX separators) matches any of the glob patterns. */
export function matchAnyGlob(patterns: string[], targetPath: string): boolean {
  return patterns.some((pattern) => matchGlob(pattern, targetPath))
}
