import fs from 'node:fs/promises'
import * as os from 'node:os'
import path from 'node:path'
import { walkFiles } from './fsutil'

describe('walkFiles safety', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sync-walk-'))
  })

  afterEach(async () => {
    jest.restoreAllMocks()
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  test('only an explicitly optional missing root is treated as empty', async () => {
    const missing = path.join(tmpDir, 'missing')

    await expect(walkFiles(missing)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(
      walkFiles(missing, { allowMissingRoot: true })
    ).resolves.toEqual([])
  })

  test.each([false, true])(
    'a disappearing descendant aborts traversal with allowMissingRoot=%s',
    async (allowMissingRoot) => {
      await fs.mkdir(path.join(tmpDir, 'child'))
      const readDirectory = fs.readdir
      const error = Object.assign(new Error('child disappeared'), {
        code: 'ENOENT',
      })
      jest
        .spyOn(fs, 'readdir')
        .mockImplementationOnce(readDirectory)
        .mockRejectedValueOnce(error)

      await expect(walkFiles(tmpDir, { allowMissingRoot })).rejects.toBe(error)
    }
  )

  test('an optional root does not hide permission failures', async () => {
    const error = Object.assign(new Error('permission denied'), {
      code: 'EACCES',
    })
    jest.spyOn(fs, 'readdir').mockRejectedValueOnce(error)

    await expect(walkFiles(tmpDir, { allowMissingRoot: true })).rejects.toBe(
      error
    )
  })
})
