import type { BasicFormField } from '@keystatic/core'
import type { ReactElement } from 'react'
import {
  FontAwesomeIconSelectInput,
  type FaSelectOption,
} from '@/lib/keystatic-fa-icon-picker-input'

/**
 * Campo tipo `fields.select` com pré-visualização Font Awesome na lista.
 * O input com `Picker` vive em módulo `'use client'`; esta fábrica corre no
 * servidor (ex.: `keystatic.config.ts`, reader) sem diretiva client.
 */

type FormFieldInputProps<Value> = {
  value: Value
  onChange(value: Value): void
  autoFocus: boolean
  forceValidation: boolean
}

class FieldDataError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FieldDataError'
  }
}

function basicFormFieldWithSimpleReaderParse<
  ParsedValue extends string | null,
>(config: {
  label?: string
  Input: (props: FormFieldInputProps<ParsedValue>) => ReactElement | null
  defaultValue: () => ParsedValue
  parse: (value: unknown) => ParsedValue
  serialize: (value: ParsedValue) => { value: unknown }
  validate: (value: ParsedValue) => ParsedValue
}) {
  return {
    kind: 'form' as const,
    Input: config.Input,
    defaultValue: config.defaultValue,
    parse: config.parse,
    serialize: config.serialize,
    validate: config.validate,
    reader: {
      parse(value: unknown) {
        return config.validate(config.parse(value))
      },
    },
    label: config.label,
  }
}

export function fontawesomeIconSelectField({
  label,
  options,
  defaultValue,
  description,
}: {
  label: string
  options: readonly FaSelectOption[]
  defaultValue: FaSelectOption['value']
  description?: string
}) {
  const optionValuesSet = new Set(options.map((x) => x.value))
  if (!optionValuesSet.has(defaultValue)) {
    throw new Error(
      `A defaultValue of ${defaultValue} was provided to fontawesomeIconSelectField but it does not match one of the options`,
    )
  }

  const field = basicFormFieldWithSimpleReaderParse({
    label,
    Input(props: FormFieldInputProps<string>) {
      return (
        <FontAwesomeIconSelectInput
          label={label}
          description={description}
          options={options}
          value={props.value}
          onChange={props.onChange}
          autoFocus={props.autoFocus}
          forceValidation={props.forceValidation}
        />
      )
    },
    defaultValue() {
      return defaultValue
    },
    parse(value: unknown) {
      if (value === undefined) {
        return defaultValue
      }
      if (typeof value !== 'string') {
        throw new FieldDataError('Must be a string')
      }
      if (!optionValuesSet.has(value)) {
        throw new FieldDataError('Must be a valid option')
      }
      return value
    },
    validate(value: string) {
      return value
    },
    serialize(value: string) {
      return { value }
    },
  })

  return {
    ...field,
    options,
  } as BasicFormField<string> & { options: readonly FaSelectOption[] }
}
