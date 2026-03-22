'use client'

import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Flex, type FlexProps } from '@keystar/ui/layout'
import { Item, Picker } from '@keystar/ui/picker'
import { useSlotProps } from '@keystar/ui/slots'
import { Text } from '@keystar/ui/typography'
import {
  faStorageKeyToPathLabel,
  getVisitCardFaIcon,
} from '@/lib/visit-card-fontawesome'

export type FaSelectOption = { label: string; value: string }

export type FaIconPickerInputProps = {
  label: string
  description?: string
  options: readonly FaSelectOption[]
  value: string
  onChange: (v: string) => void
  autoFocus: boolean
  forceValidation: boolean
}

function FaPickerIconSlot({ icon }: { icon?: IconDefinition }) {
  // O ListItem injeta `gridArea`, `marginEnd`, etc. no slot `icon`. Essas props
  // têm de passar por `useStyleProps` (como o `Icon` nativo); um `<span>` cru
  // não as converte em CSS e o ícone acaba sobreposto ao texto.
  const iconSlotProps = useSlotProps(
    {
      slot: 'icon',
      alignItems: 'center',
      justifyContent: 'center',
    } as { id?: string; slot?: string } & FlexProps,
    'icon',
  )
  return (
    <Flex {...(iconSlotProps as FlexProps)} elementType="span">
      {icon ? (
        <FontAwesomeIcon icon={icon} style={{ width: 18, height: 18 }} />
      ) : null}
    </Flex>
  )
}

export function FontAwesomeIconSelectInput({
  label,
  description,
  options,
  value,
  onChange,
  autoFocus,
}: FaIconPickerInputProps) {
  return (
    <Picker
      label={label}
      description={description}
      items={options}
      selectedKey={value}
      onSelectionChange={(key) => {
        if (key != null) onChange(String(key))
      }}
      autoFocus={autoFocus}
      width={{ mobile: 'auto', tablet: 'auto' }}
    >
      {(item) => {
        const opt = item as unknown as FaSelectOption
        const def = getVisitCardFaIcon(opt.value)
        const pathLabel = faStorageKeyToPathLabel(opt.value)
        return (
          <Item
            key={opt.value}
            textValue={`${opt.label} ${pathLabel}`}
          >
            <FaPickerIconSlot icon={def} />
            <Text>{opt.label}</Text>
            <Text slot="description" truncate={1}>
              {pathLabel}
            </Text>
          </Item>
        )
      }}
    </Picker>
  )
}
