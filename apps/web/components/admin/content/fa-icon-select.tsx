'use client'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  VISIT_CARD_FA_SELECT_OPTIONS,
  VISIT_CARD_FA_ICON_MAP,
} from '@/lib/visit-card-fontawesome'
import { SelectField } from './fields'

export function FaIconSelect(props: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  const icon = VISIT_CARD_FA_ICON_MAP[props.value]
  return (
    <div className="flex items-end gap-3">
      <div className="flex-1">
        <SelectField
          label={props.label}
          value={props.value}
          onChange={props.onChange}
          options={VISIT_CARD_FA_SELECT_OPTIONS}
        />
      </div>
      <div className="bg-accent-soft text-primary grid size-10 place-items-center rounded-lg">
        {icon ? <FontAwesomeIcon icon={icon} className="size-5" /> : null}
      </div>
    </div>
  )
}
