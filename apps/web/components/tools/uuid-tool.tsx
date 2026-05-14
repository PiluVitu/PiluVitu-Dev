'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { CopyButton } from './copy-button'
import { uuidV4 } from '@/lib/tools/uuid'

export function UuidTool() {
  const [uuids, setUuids] = useState<string[]>([])

  function generate() {
    setUuids((prev) => [uuidV4(), ...prev].slice(0, 10))
  }

  return (
    <div className="space-y-4">
      <Button onClick={generate} data-testid="uuid-generate">
        Gerar UUID v4
      </Button>
      {uuids.length > 0 && (
        <ul className="space-y-2">
          {uuids.map((id, i) => (
            <li
              key={id}
              className="flex items-center justify-between rounded-md border px-3 py-2 font-mono text-sm"
            >
              <span data-testid={i === 0 ? 'uuid-result' : undefined}>
                {id}
              </span>
              <CopyButton value={id} label="Copiar" />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
