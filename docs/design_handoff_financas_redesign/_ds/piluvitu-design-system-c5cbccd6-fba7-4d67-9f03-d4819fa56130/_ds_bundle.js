/* @ds-bundle: {"format":4,"namespace":"PiluVituDesignSystem_c5cbcc","components":[{"name":"AspectRatio","sourcePath":"components/core/AspectRatio.jsx"},{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"CardHeader","sourcePath":"components/core/Card.jsx"},{"name":"CardTitle","sourcePath":"components/core/Card.jsx"},{"name":"CardDescription","sourcePath":"components/core/Card.jsx"},{"name":"CardContent","sourcePath":"components/core/Card.jsx"},{"name":"CardFooter","sourcePath":"components/core/Card.jsx"},{"name":"Separator","sourcePath":"components/core/Separator.jsx"},{"name":"Skeleton","sourcePath":"components/core/Skeleton.jsx"},{"name":"Avatar","sourcePath":"components/data/Avatar.jsx"},{"name":"AvatarImage","sourcePath":"components/data/Avatar.jsx"},{"name":"AvatarFallback","sourcePath":"components/data/Avatar.jsx"},{"name":"Chart","sourcePath":"components/data/Chart.jsx"},{"name":"Form","sourcePath":"components/forms/Form.jsx"},{"name":"FormItem","sourcePath":"components/forms/Form.jsx"},{"name":"FormLabel","sourcePath":"components/forms/Form.jsx"},{"name":"FormControl","sourcePath":"components/forms/Form.jsx"},{"name":"FormDescription","sourcePath":"components/forms/Form.jsx"},{"name":"FormMessage","sourcePath":"components/forms/Form.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Label","sourcePath":"components/forms/Label.jsx"},{"name":"Textarea","sourcePath":"components/forms/Textarea.jsx"},{"name":"Ajuda","sourcePath":"components/overlay/Ajuda.jsx"},{"name":"Command","sourcePath":"components/overlay/Command.jsx"},{"name":"CommandInput","sourcePath":"components/overlay/Command.jsx"},{"name":"CommandList","sourcePath":"components/overlay/Command.jsx"},{"name":"CommandEmpty","sourcePath":"components/overlay/Command.jsx"},{"name":"CommandGroup","sourcePath":"components/overlay/Command.jsx"},{"name":"CommandItem","sourcePath":"components/overlay/Command.jsx"},{"name":"Dialog","sourcePath":"components/overlay/Dialog.jsx"},{"name":"DialogTrigger","sourcePath":"components/overlay/Dialog.jsx"},{"name":"DialogClose","sourcePath":"components/overlay/Dialog.jsx"},{"name":"DialogContent","sourcePath":"components/overlay/Dialog.jsx"},{"name":"DialogHeader","sourcePath":"components/overlay/Dialog.jsx"},{"name":"DialogFooter","sourcePath":"components/overlay/Dialog.jsx"},{"name":"DialogTitle","sourcePath":"components/overlay/Dialog.jsx"},{"name":"DialogDescription","sourcePath":"components/overlay/Dialog.jsx"},{"name":"DropdownMenu","sourcePath":"components/overlay/DropdownMenu.jsx"},{"name":"DropdownMenuTrigger","sourcePath":"components/overlay/DropdownMenu.jsx"},{"name":"DropdownMenuContent","sourcePath":"components/overlay/DropdownMenu.jsx"},{"name":"DropdownMenuItem","sourcePath":"components/overlay/DropdownMenu.jsx"},{"name":"DropdownMenuSeparator","sourcePath":"components/overlay/DropdownMenu.jsx"},{"name":"DropdownMenuLabel","sourcePath":"components/overlay/DropdownMenu.jsx"},{"name":"Sheet","sourcePath":"components/overlay/Sheet.jsx"},{"name":"SheetTrigger","sourcePath":"components/overlay/Sheet.jsx"},{"name":"SheetClose","sourcePath":"components/overlay/Sheet.jsx"},{"name":"SheetContent","sourcePath":"components/overlay/Sheet.jsx"},{"name":"SheetHeader","sourcePath":"components/overlay/Sheet.jsx"},{"name":"SheetTitle","sourcePath":"components/overlay/Sheet.jsx"},{"name":"SheetDescription","sourcePath":"components/overlay/Sheet.jsx"}],"sourceHashes":{"components/core/AspectRatio.jsx":"1a4ef0ceee97","components/core/Badge.jsx":"18a9dcc8877e","components/core/Button.jsx":"d4c2fac2f461","components/core/Card.jsx":"94db43c273cf","components/core/Separator.jsx":"cddde7bec8c7","components/core/Skeleton.jsx":"80e1825cbeeb","components/data/Avatar.jsx":"6c5cf00df112","components/data/Chart.jsx":"f9879f31862f","components/forms/Form.jsx":"cc25433f87d7","components/forms/Input.jsx":"665a8caaf601","components/forms/Label.jsx":"6f5bd239cef4","components/forms/Textarea.jsx":"91b7bb386816","components/overlay/Ajuda.jsx":"c727c93df806","components/overlay/Command.jsx":"900cb5a6fc6c","components/overlay/Dialog.jsx":"bb572378a5b8","components/overlay/DropdownMenu.jsx":"bea108243007","components/overlay/Sheet.jsx":"a1845bacdc8e","ui_kits/portfolio/Bio.jsx":"3f06214aeefc","ui_kits/portfolio/HomeSections.jsx":"a3ad32cac2f2","ui_kits/portfolio/data.js":"49010b62b8a3"},"inlinedExternals":[],"unexposedExports":[]} */

;(() => {
  const __ds_ns = (window.PiluVituDesignSystem_c5cbcc =
    window.PiluVituDesignSystem_c5cbcc || {})

  const __ds_scope = {}

  __ds_ns.__errors = __ds_ns.__errors || []

  // components/core/AspectRatio.jsx
  try {
    ;(() => {
      function _extends() {
        return (
          (_extends = Object.assign
            ? Object.assign.bind()
            : function (n) {
                for (var e = 1; e < arguments.length; e++) {
                  var t = arguments[e]
                  for (var r in t)
                    ({}).hasOwnProperty.call(t, r) && (n[r] = t[r])
                }
                return n
              }),
          _extends.apply(null, arguments)
        )
      }
      /** AspectRatio — constrains a child to a fixed W/H ratio. Mirrors packages/ui/src/aspect-ratio.tsx (Radix passthrough). */
      function AspectRatio({
        ratio = 1,
        className,
        style,
        children,
        ...props
      }) {
        return /*#__PURE__*/ React.createElement(
          'div',
          _extends(
            {
              className: className,
              style: {
                position: 'relative',
                width: '100%',
                paddingBottom: `${100 / ratio}%`,
                ...style,
              },
            },
            props,
          ),
          /*#__PURE__*/ React.createElement(
            'div',
            {
              style: {
                position: 'absolute',
                inset: 0,
              },
            },
            children,
          ),
        )
      }
      Object.assign(__ds_scope, { AspectRatio })
    })()
  } catch (e) {
    __ds_ns.__errors.push({
      path: 'components/core/AspectRatio.jsx',
      error: String((e && e.message) || e),
    })
  }

  // components/core/Badge.jsx
  try {
    ;(() => {
      function _extends() {
        return (
          (_extends = Object.assign
            ? Object.assign.bind()
            : function (n) {
                for (var e = 1; e < arguments.length; e++) {
                  var t = arguments[e]
                  for (var r in t)
                    ({}).hasOwnProperty.call(t, r) && (n[r] = t[r])
                }
                return n
              }),
          _extends.apply(null, arguments)
        )
      }
      function variantStyle(variant) {
        switch (variant) {
          case 'secondary':
            return {
              background: 'hsl(var(--secondary))',
              color: 'hsl(var(--secondary-foreground))',
              border: '1px solid transparent',
            }
          case 'destructive':
            return {
              background: 'hsl(var(--destructive))',
              color: 'hsl(var(--destructive-foreground))',
              border: '1px solid transparent',
            }
          case 'outline':
            return {
              background: 'transparent',
              color: 'hsl(var(--foreground))',
              border: '1px solid hsl(var(--border))',
            }
          default:
            return {
              background: 'hsl(var(--primary))',
              color: 'hsl(var(--primary-foreground))',
              border: '1px solid transparent',
            }
        }
      }

      /** Badge — small status/tag pill. Mirrors packages/ui/src/badge.tsx. */
      function Badge({
        variant = 'default',
        className,
        style,
        children,
        ...props
      }) {
        return /*#__PURE__*/ React.createElement(
          'div',
          _extends(
            {
              className: className,
              style: {
                display: 'inline-flex',
                alignItems: 'center',
                borderRadius: 'var(--radius-md)',
                padding: '2px 10px',
                fontSize: 12,
                fontWeight: 600,
                fontFamily: 'var(--font-sans)',
                ...variantStyle(variant),
                ...style,
              },
            },
            props,
          ),
          children,
        )
      }
      Object.assign(__ds_scope, { Badge })
    })()
  } catch (e) {
    __ds_ns.__errors.push({
      path: 'components/core/Badge.jsx',
      error: String((e && e.message) || e),
    })
  }

  // components/core/Button.jsx
  try {
    ;(() => {
      function _extends() {
        return (
          (_extends = Object.assign
            ? Object.assign.bind()
            : function (n) {
                for (var e = 1; e < arguments.length; e++) {
                  var t = arguments[e]
                  for (var r in t)
                    ({}).hasOwnProperty.call(t, r) && (n[r] = t[r])
                }
                return n
              }),
          _extends.apply(null, arguments)
        )
      }
      const sizeStyles = {
        default: {
          height: 36,
          padding: '0 16px',
          fontSize: 14,
        },
        sm: {
          height: 32,
          padding: '0 12px',
          fontSize: 13,
          borderRadius: 'var(--radius-sm)',
        },
        lg: {
          height: 40,
          padding: '0 32px',
          fontSize: 14,
        },
        icon: {
          height: 36,
          width: 36,
          padding: 0,
        },
      }
      function variantStyle(variant) {
        switch (variant) {
          case 'destructive':
            return {
              background: 'hsl(var(--destructive))',
              color: 'hsl(var(--destructive-foreground))',
              border: 'none',
            }
          case 'outline':
            return {
              background: 'hsl(var(--background))',
              color: 'hsl(var(--foreground))',
              border: '1px solid hsl(var(--input))',
            }
          case 'secondary':
            return {
              background: 'hsl(var(--secondary))',
              color: 'hsl(var(--secondary-foreground))',
              border: 'none',
            }
          case 'ghost':
            return {
              background: 'transparent',
              color: 'hsl(var(--foreground))',
              border: 'none',
            }
          case 'link':
            return {
              background: 'transparent',
              color: 'hsl(var(--primary))',
              border: 'none',
              textDecoration: 'underline',
              textUnderlineOffset: 4,
              padding: 0,
              height: 'auto',
            }
          default:
            return {
              background: 'hsl(var(--primary))',
              color: 'hsl(var(--primary-foreground))',
              border: 'none',
            }
        }
      }
      function hoverBackground(variant) {
        switch (variant) {
          case 'destructive':
            return 'hsl(var(--destructive) / 0.9)'
          case 'outline':
            return 'hsl(var(--accent))'
          case 'secondary':
            return 'hsl(var(--secondary) / 0.8)'
          case 'ghost':
            return 'hsl(var(--accent))'
          default:
            return 'hsl(var(--primary) / 0.9)'
        }
      }

      /** Button — primary interactive control. Mirrors packages/ui/src/button.tsx (shadcn cva variants). */
      function Button({
        variant = 'default',
        size = 'default',
        disabled,
        className,
        style,
        children,
        as: As = 'button',
        ...props
      }) {
        const [hover, setHover] = React.useState(false)
        const vs = variantStyle(variant)
        const base = {
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          whiteSpace: 'nowrap',
          borderRadius: 'var(--radius-md)',
          fontFamily: 'var(--font-sans)',
          fontWeight: 500,
          cursor: disabled ? 'default' : 'pointer',
          transition:
            'background-color var(--duration-base) var(--ease-standard)',
          opacity: disabled ? 0.5 : 1,
          pointerEvents: disabled ? 'none' : 'auto',
          boxShadow:
            variant === 'default' || variant === 'secondary'
              ? 'var(--shadow-xs)'
              : variant === 'destructive'
                ? 'var(--shadow-xs)'
                : 'none',
        }
        return /*#__PURE__*/ React.createElement(
          As,
          _extends(
            {
              className: className,
              disabled: disabled,
              onMouseEnter: () => setHover(true),
              onMouseLeave: () => setHover(false),
              style: {
                ...base,
                ...vs,
                ...(hover && !disabled
                  ? {
                      background: hoverBackground(variant),
                    }
                  : {}),
                ...sizeStyles[size],
                ...style,
              },
            },
            props,
          ),
          children,
        )
      }
      Object.assign(__ds_scope, { Button })
    })()
  } catch (e) {
    __ds_ns.__errors.push({
      path: 'components/core/Button.jsx',
      error: String((e && e.message) || e),
    })
  }

  // components/core/Card.jsx
  try {
    ;(() => {
      function _extends() {
        return (
          (_extends = Object.assign
            ? Object.assign.bind()
            : function (n) {
                for (var e = 1; e < arguments.length; e++) {
                  var t = arguments[e]
                  for (var r in t)
                    ({}).hasOwnProperty.call(t, r) && (n[r] = t[r])
                }
                return n
              }),
          _extends.apply(null, arguments)
        )
      }
      /** Card — surface container. Mirrors packages/ui/src/card.tsx (Card/CardHeader/CardTitle/CardDescription/CardContent/CardFooter). */
      function Card({ className, style, children, ...props }) {
        return /*#__PURE__*/ React.createElement(
          'div',
          _extends(
            {
              className: className,
              style: {
                background: 'hsl(var(--card))',
                color: 'hsl(var(--card-foreground))',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid hsl(var(--border))',
                boxShadow: 'var(--shadow-sm)',
                ...style,
              },
            },
            props,
          ),
          children,
        )
      }
      function CardHeader({ className, style, children, ...props }) {
        return /*#__PURE__*/ React.createElement(
          'div',
          _extends(
            {
              className: className,
              style: {
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                padding: 24,
                ...style,
              },
            },
            props,
          ),
          children,
        )
      }
      function CardTitle({ className, style, children, ...props }) {
        return /*#__PURE__*/ React.createElement(
          'h3',
          _extends(
            {
              className: className,
              style: {
                fontWeight: 600,
                lineHeight: 1,
                letterSpacing: '-0.01em',
                margin: 0,
                fontFamily: 'var(--font-sans)',
                ...style,
              },
            },
            props,
          ),
          children,
        )
      }
      function CardDescription({ className, style, children, ...props }) {
        return /*#__PURE__*/ React.createElement(
          'p',
          _extends(
            {
              className: className,
              style: {
                color: 'hsl(var(--muted-foreground))',
                fontSize: 14,
                margin: 0,
                ...style,
              },
            },
            props,
          ),
          children,
        )
      }
      function CardContent({ className, style, children, ...props }) {
        return /*#__PURE__*/ React.createElement(
          'div',
          _extends(
            {
              className: className,
              style: {
                padding: '0 24px 24px',
                ...style,
              },
            },
            props,
          ),
          children,
        )
      }
      function CardFooter({ className, style, children, ...props }) {
        return /*#__PURE__*/ React.createElement(
          'div',
          _extends(
            {
              className: className,
              style: {
                display: 'flex',
                alignItems: 'center',
                padding: '0 24px 24px',
                ...style,
              },
            },
            props,
          ),
          children,
        )
      }
      Object.assign(__ds_scope, {
        Card,
        CardHeader,
        CardTitle,
        CardDescription,
        CardContent,
        CardFooter,
      })
    })()
  } catch (e) {
    __ds_ns.__errors.push({
      path: 'components/core/Card.jsx',
      error: String((e && e.message) || e),
    })
  }

  // components/core/Separator.jsx
  try {
    ;(() => {
      function _extends() {
        return (
          (_extends = Object.assign
            ? Object.assign.bind()
            : function (n) {
                for (var e = 1; e < arguments.length; e++) {
                  var t = arguments[e]
                  for (var r in t)
                    ({}).hasOwnProperty.call(t, r) && (n[r] = t[r])
                }
                return n
              }),
          _extends.apply(null, arguments)
        )
      }
      /** Separator — 1px hairline. Mirrors packages/ui/src/separator.tsx. */
      function Separator({
        orientation = 'horizontal',
        className,
        style,
        ...props
      }) {
        return /*#__PURE__*/ React.createElement(
          'div',
          _extends(
            {
              className: className,
              role: 'separator',
              style: {
                background: 'hsl(var(--border))',
                flexShrink: 0,
                ...(orientation === 'horizontal'
                  ? {
                      height: 1,
                      width: '100%',
                    }
                  : {
                      height: '100%',
                      width: 1,
                    }),
                ...style,
              },
            },
            props,
          ),
        )
      }
      Object.assign(__ds_scope, { Separator })
    })()
  } catch (e) {
    __ds_ns.__errors.push({
      path: 'components/core/Separator.jsx',
      error: String((e && e.message) || e),
    })
  }

  // components/core/Skeleton.jsx
  try {
    ;(() => {
      function _extends() {
        return (
          (_extends = Object.assign
            ? Object.assign.bind()
            : function (n) {
                for (var e = 1; e < arguments.length; e++) {
                  var t = arguments[e]
                  for (var r in t)
                    ({}).hasOwnProperty.call(t, r) && (n[r] = t[r])
                }
                return n
              }),
          _extends.apply(null, arguments)
        )
      }
      /** Skeleton — pulsing loading placeholder. Mirrors packages/ui/src/skeleton.tsx. */
      function Skeleton({ className, style, ...props }) {
        return /*#__PURE__*/ React.createElement(
          'div',
          _extends(
            {
              className: className,
              style: {
                background: 'hsl(var(--primary) / 0.1)',
                borderRadius: 'var(--radius-md)',
                animation: 'ds-pulse 2s cubic-bezier(0.4,0,0.6,1) infinite',
                ...style,
              },
            },
            props,
          ),
        )
      }
      Object.assign(__ds_scope, { Skeleton })
    })()
  } catch (e) {
    __ds_ns.__errors.push({
      path: 'components/core/Skeleton.jsx',
      error: String((e && e.message) || e),
    })
  }

  // components/data/Avatar.jsx
  try {
    ;(() => {
      function _extends() {
        return (
          (_extends = Object.assign
            ? Object.assign.bind()
            : function (n) {
                for (var e = 1; e < arguments.length; e++) {
                  var t = arguments[e]
                  for (var r in t)
                    ({}).hasOwnProperty.call(t, r) && (n[r] = t[r])
                }
                return n
              }),
          _extends.apply(null, arguments)
        )
      }
      /** Avatar — image with initials fallback. Mirrors packages/ui/src/avatar.tsx. Radius is caller-controlled: rounded-full in the visit-card grid, rounded-xl/rounded-lg/rounded-md elsewhere. */
      function Avatar({ className, style, children, ...props }) {
        return /*#__PURE__*/ React.createElement(
          'div',
          _extends(
            {
              className: className,
              style: {
                position: 'relative',
                display: 'flex',
                flexShrink: 0,
                overflow: 'hidden',
                borderRadius: '50%',
                width: 40,
                height: 40,
                ...style,
              },
            },
            props,
          ),
          children,
        )
      }
      function AvatarImage({ src, alt = '', style, ...props }) {
        const [errored, setErrored] = React.useState(false)
        if (!src || errored) return null
        return /*#__PURE__*/ React.createElement(
          'img',
          _extends(
            {
              src: src,
              alt: alt,
              onError: () => setErrored(true),
              style: {
                aspectRatio: '1/1',
                height: '100%',
                width: '100%',
                objectFit: 'cover',
                ...style,
              },
            },
            props,
          ),
        )
      }
      function AvatarFallback({ className, style, children, ...props }) {
        return /*#__PURE__*/ React.createElement(
          'div',
          _extends(
            {
              className: className,
              style: {
                display: 'flex',
                height: '100%',
                width: '100%',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'hsl(var(--muted))',
                fontSize: 13,
                fontWeight: 600,
                ...style,
              },
            },
            props,
          ),
          children,
        )
      }
      Object.assign(__ds_scope, { Avatar, AvatarImage, AvatarFallback })
    })()
  } catch (e) {
    __ds_ns.__errors.push({
      path: 'components/data/Avatar.jsx',
      error: String((e && e.message) || e),
    })
  }

  // components/data/Chart.jsx
  try {
    ;(() => {
      const palette = [
        'var(--color-chart-1, hsl(198 93% 60%))',
        'hsl(var(--ok))',
        'hsl(var(--warn))',
        'hsl(var(--win))',
        'hsl(340 75% 55%)',
      ]

      /** Chart — minimal bar/line chart, no external charting lib. Simplified stand-in for packages/ui/src/chart.tsx (which wraps recharts). data: [{ label, value }] or [{ label, series: [v1, v2, ...] }]. */
      function Chart({
        data = [],
        type = 'bar',
        height = 160,
        className,
        style,
      }) {
        const max = Math.max(
          1,
          ...data.map((d) =>
            Array.isArray(d.series) ? Math.max(...d.series) : (d.value ?? 0),
          ),
        )
        if (type === 'line') {
          const w = 100 / Math.max(1, data.length - 1)
          const points = data
            .map((d, i) => `${i * w},${100 - ((d.value ?? 0) / max) * 100}`)
            .join(' ')
          return /*#__PURE__*/ React.createElement(
            'svg',
            {
              className: className,
              viewBox: '0 0 100 100',
              preserveAspectRatio: 'none',
              style: {
                width: '100%',
                height,
                ...style,
              },
            },
            /*#__PURE__*/ React.createElement('polyline', {
              points: points,
              fill: 'none',
              stroke: palette[0],
              strokeWidth: '2',
              vectorEffect: 'non-scaling-stroke',
            }),
          )
        }
        return /*#__PURE__*/ React.createElement(
          'div',
          {
            className: className,
            style: {
              display: 'flex',
              alignItems: 'flex-end',
              gap: 8,
              height,
              ...style,
            },
          },
          data.map((d, i) =>
            /*#__PURE__*/ React.createElement(
              'div',
              {
                key: d.label ?? i,
                style: {
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 6,
                },
              },
              /*#__PURE__*/ React.createElement('div', {
                style: {
                  width: '100%',
                  height: `${((d.value ?? 0) / max) * 100}%`,
                  background: palette[i % palette.length],
                  borderRadius: 'var(--radius-sm)',
                },
              }),
              d.label &&
                /*#__PURE__*/ React.createElement(
                  'span',
                  {
                    style: {
                      fontSize: 11,
                      fontFamily: 'var(--font-mono)',
                      color: 'hsl(var(--muted-foreground))',
                    },
                  },
                  d.label,
                ),
            ),
          ),
        )
      }
      Object.assign(__ds_scope, { Chart })
    })()
  } catch (e) {
    __ds_ns.__errors.push({
      path: 'components/data/Chart.jsx',
      error: String((e && e.message) || e),
    })
  }

  // components/forms/Input.jsx
  try {
    ;(() => {
      function _extends() {
        return (
          (_extends = Object.assign
            ? Object.assign.bind()
            : function (n) {
                for (var e = 1; e < arguments.length; e++) {
                  var t = arguments[e]
                  for (var r in t)
                    ({}).hasOwnProperty.call(t, r) && (n[r] = t[r])
                }
                return n
              }),
          _extends.apply(null, arguments)
        )
      }
      /** Input — single-line text field. Mirrors packages/ui/src/input.tsx. */
      function Input({ className, style, ...props }) {
        return /*#__PURE__*/ React.createElement(
          'input',
          _extends(
            {
              className: className,
              style: {
                height: 36,
                width: '100%',
                borderRadius: 'var(--radius-md)',
                border: '1px solid hsl(var(--input))',
                background: 'transparent',
                color: 'hsl(var(--foreground))',
                padding: '0 12px',
                fontSize: 14,
                fontFamily: 'var(--font-sans)',
                boxShadow: 'var(--shadow-xs)',
                outline: 'none',
                ...style,
              },
              onFocus: (e) => {
                e.target.style.boxShadow = `0 0 0 1px hsl(var(--ring))`
                props.onFocus?.(e)
              },
              onBlur: (e) => {
                e.target.style.boxShadow = 'var(--shadow-xs)'
                props.onBlur?.(e)
              },
            },
            props,
          ),
        )
      }
      Object.assign(__ds_scope, { Input })
    })()
  } catch (e) {
    __ds_ns.__errors.push({
      path: 'components/forms/Input.jsx',
      error: String((e && e.message) || e),
    })
  }

  // components/forms/Label.jsx
  try {
    ;(() => {
      function _extends() {
        return (
          (_extends = Object.assign
            ? Object.assign.bind()
            : function (n) {
                for (var e = 1; e < arguments.length; e++) {
                  var t = arguments[e]
                  for (var r in t)
                    ({}).hasOwnProperty.call(t, r) && (n[r] = t[r])
                }
                return n
              }),
          _extends.apply(null, arguments)
        )
      }
      /** Label — form field label. Mirrors packages/ui/src/label.tsx. */
      function Label({ className, style, children, ...props }) {
        return /*#__PURE__*/ React.createElement(
          'label',
          _extends(
            {
              className: className,
              style: {
                fontSize: 14,
                fontWeight: 500,
                lineHeight: 1,
                fontFamily: 'var(--font-sans)',
                color: 'hsl(var(--foreground))',
                ...style,
              },
            },
            props,
          ),
          children,
        )
      }
      Object.assign(__ds_scope, { Label })
    })()
  } catch (e) {
    __ds_ns.__errors.push({
      path: 'components/forms/Label.jsx',
      error: String((e && e.message) || e),
    })
  }

  // components/forms/Form.jsx
  try {
    ;(() => {
      function _extends() {
        return (
          (_extends = Object.assign
            ? Object.assign.bind()
            : function (n) {
                for (var e = 1; e < arguments.length; e++) {
                  var t = arguments[e]
                  for (var r in t)
                    ({}).hasOwnProperty.call(t, r) && (n[r] = t[r])
                }
                return n
              }),
          _extends.apply(null, arguments)
        )
      }
      /** Form — plain <form> wrapper. Field group pieces below are the framework-agnostic stand-in for packages/ui/src/form.tsx (which wraps react-hook-form). */
      function Form({ children, ...props }) {
        return /*#__PURE__*/ React.createElement('form', props, children)
      }
      function FormItem({ style, children, ...props }) {
        return /*#__PURE__*/ React.createElement(
          'div',
          _extends(
            {
              style: {
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                ...style,
              },
            },
            props,
          ),
          children,
        )
      }
      function FormLabel(props) {
        return /*#__PURE__*/ React.createElement(__ds_scope.Label, props)
      }
      function FormControl({ children }) {
        return children
      }
      function FormDescription({ style, children, ...props }) {
        return /*#__PURE__*/ React.createElement(
          'p',
          _extends(
            {
              style: {
                fontSize: 13,
                color: 'hsl(var(--muted-foreground))',
                margin: 0,
                ...style,
              },
            },
            props,
          ),
          children,
        )
      }
      function FormMessage({ style, children, ...props }) {
        if (!children) return null
        return /*#__PURE__*/ React.createElement(
          'p',
          _extends(
            {
              style: {
                fontSize: 13,
                color: 'hsl(var(--destructive))',
                margin: 0,
                fontWeight: 500,
                ...style,
              },
            },
            props,
          ),
          children,
        )
      }
      Object.assign(__ds_scope, {
        Form,
        FormItem,
        FormLabel,
        FormControl,
        FormDescription,
        FormMessage,
      })
    })()
  } catch (e) {
    __ds_ns.__errors.push({
      path: 'components/forms/Form.jsx',
      error: String((e && e.message) || e),
    })
  }

  // components/forms/Textarea.jsx
  try {
    ;(() => {
      function _extends() {
        return (
          (_extends = Object.assign
            ? Object.assign.bind()
            : function (n) {
                for (var e = 1; e < arguments.length; e++) {
                  var t = arguments[e]
                  for (var r in t)
                    ({}).hasOwnProperty.call(t, r) && (n[r] = t[r])
                }
                return n
              }),
          _extends.apply(null, arguments)
        )
      }
      /** Textarea — multi-line text field. Mirrors packages/ui/src/textarea.tsx. */
      function Textarea({ className, style, ...props }) {
        return /*#__PURE__*/ React.createElement(
          'textarea',
          _extends(
            {
              className: className,
              style: {
                minHeight: 60,
                width: '100%',
                borderRadius: 'var(--radius-md)',
                border: '1px solid hsl(var(--input))',
                background: 'transparent',
                color: 'hsl(var(--foreground))',
                padding: '8px 12px',
                fontSize: 14,
                fontFamily: 'var(--font-sans)',
                boxShadow: 'var(--shadow-xs)',
                outline: 'none',
                resize: 'vertical',
                ...style,
              },
              onFocus: (e) => {
                e.target.style.boxShadow = `0 0 0 1px hsl(var(--ring))`
                props.onFocus?.(e)
              },
              onBlur: (e) => {
                e.target.style.boxShadow = 'var(--shadow-xs)'
                props.onBlur?.(e)
              },
            },
            props,
          ),
        )
      }
      Object.assign(__ds_scope, { Textarea })
    })()
  } catch (e) {
    __ds_ns.__errors.push({
      path: 'components/forms/Textarea.jsx',
      error: String((e && e.message) || e),
    })
  }

  // components/overlay/Ajuda.jsx
  try {
    ;(() => {
      /** Ajuda ("?" help popover) — brand-specific primitive. A Popover, deliberately NOT a Tooltip: hover doesn't exist on touch, and the target audience checks this on a phone in daylight. Tap opens/closes. Mirrors packages/ui/src/ajuda.tsx. */
      function Ajuda({ rotulo, children, className }) {
        const [open, setOpen] = React.useState(false)
        const ref = React.useRef(null)
        React.useEffect(() => {
          if (!open) return
          const onDocClick = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false)
          }
          document.addEventListener('mousedown', onDocClick)
          return () => document.removeEventListener('mousedown', onDocClick)
        }, [open])
        return /*#__PURE__*/ React.createElement(
          'div',
          {
            ref: ref,
            style: {
              position: 'relative',
              display: 'inline-block',
            },
          },
          /*#__PURE__*/ React.createElement(
            'button',
            {
              type: 'button',
              'aria-label': `Ajuda sobre ${rotulo}`,
              onClick: () => setOpen((o) => !o),
              className: className,
              style: {
                position: 'relative',
                height: 20,
                width: 20,
                borderRadius: '50%',
                border: '1px solid hsl(var(--input))',
                background: 'hsl(var(--background))',
                color: 'hsl(var(--muted-foreground))',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              },
            },
            /*#__PURE__*/ React.createElement(
              'span',
              {
                'aria-hidden': 'true',
              },
              '?',
            ),
          ),
          open &&
            /*#__PURE__*/ React.createElement(
              'div',
              {
                style: {
                  position: 'absolute',
                  top: '100%',
                  marginTop: 4,
                  left: 0,
                  zIndex: 50,
                  width: 288,
                  background: 'hsl(var(--popover))',
                  color: 'hsl(var(--popover-foreground))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: 'var(--shadow-md)',
                  padding: 12,
                  fontSize: 14,
                  fontFamily: 'var(--font-sans)',
                },
              },
              children,
            ),
        )
      }
      Object.assign(__ds_scope, { Ajuda })
    })()
  } catch (e) {
    __ds_ns.__errors.push({
      path: 'components/overlay/Ajuda.jsx',
      error: String((e && e.message) || e),
    })
  }

  // components/overlay/Command.jsx
  try {
    ;(() => {
      function _extends() {
        return (
          (_extends = Object.assign
            ? Object.assign.bind()
            : function (n) {
                for (var e = 1; e < arguments.length; e++) {
                  var t = arguments[e]
                  for (var r in t)
                    ({}).hasOwnProperty.call(t, r) && (n[r] = t[r])
                }
                return n
              }),
          _extends.apply(null, arguments)
        )
      }
      /** Command — searchable command/menu list (⌘K-style). Simplified stand-in for packages/ui/src/command.tsx (cmdk + Radix Dialog). */
      function Command({ className, style, children, ...props }) {
        return /*#__PURE__*/ React.createElement(
          'div',
          _extends(
            {
              className: className,
              style: {
                display: 'flex',
                flexDirection: 'column',
                background: 'hsl(var(--popover))',
                color: 'hsl(var(--popover-foreground))',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
                fontFamily: 'var(--font-sans)',
                ...style,
              },
            },
            props,
          ),
          children,
        )
      }
      function CommandInput({ style, ...props }) {
        return /*#__PURE__*/ React.createElement(
          'div',
          {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              borderBottom: '1px solid hsl(var(--border))',
              padding: '0 12px',
            },
          },
          /*#__PURE__*/ React.createElement(
            'span',
            {
              style: {
                opacity: 0.5,
              },
              'aria-hidden': true,
            },
            '\u2315',
          ),
          /*#__PURE__*/ React.createElement(
            'input',
            _extends(
              {
                placeholder: 'Buscar...',
                style: {
                  flex: 1,
                  height: 40,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  fontSize: 14,
                  color: 'inherit',
                  fontFamily: 'inherit',
                  ...style,
                },
              },
              props,
            ),
          ),
        )
      }
      function CommandList({ style, children, ...props }) {
        return /*#__PURE__*/ React.createElement(
          'div',
          _extends(
            {
              style: {
                maxHeight: 300,
                overflowY: 'auto',
                padding: 4,
                ...style,
              },
            },
            props,
          ),
          children,
        )
      }
      function CommandEmpty({ style, children, ...props }) {
        return /*#__PURE__*/ React.createElement(
          'div',
          _extends(
            {
              style: {
                padding: '24px 0',
                textAlign: 'center',
                fontSize: 14,
                color: 'hsl(var(--muted-foreground))',
                ...style,
              },
            },
            props,
          ),
          children,
        )
      }
      function CommandGroup({ heading, style, children, ...props }) {
        return /*#__PURE__*/ React.createElement(
          'div',
          _extends(
            {
              style: {
                padding: 4,
                ...style,
              },
            },
            props,
          ),
          heading &&
            /*#__PURE__*/ React.createElement(
              'div',
              {
                style: {
                  padding: '6px 8px',
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'hsl(var(--muted-foreground))',
                },
              },
              heading,
            ),
          children,
        )
      }
      function CommandItem({ onSelect, className, style, children, ...props }) {
        const [hover, setHover] = React.useState(false)
        return /*#__PURE__*/ React.createElement(
          'div',
          _extends(
            {
              className: className,
              onMouseEnter: () => setHover(true),
              onMouseLeave: () => setHover(false),
              onClick: onSelect,
              style: {
                display: 'flex',
                alignItems: 'center',
                padding: '6px 8px',
                borderRadius: 'var(--radius-sm)',
                fontSize: 14,
                cursor: 'pointer',
                background: hover ? 'hsl(var(--accent))' : 'transparent',
                color: hover ? 'hsl(var(--accent-foreground))' : 'inherit',
                ...style,
              },
            },
            props,
          ),
          children,
        )
      }
      Object.assign(__ds_scope, {
        Command,
        CommandInput,
        CommandList,
        CommandEmpty,
        CommandGroup,
        CommandItem,
      })
    })()
  } catch (e) {
    __ds_ns.__errors.push({
      path: 'components/overlay/Command.jsx',
      error: String((e && e.message) || e),
    })
  }

  // components/overlay/Dialog.jsx
  try {
    ;(() => {
      function _extends() {
        return (
          (_extends = Object.assign
            ? Object.assign.bind()
            : function (n) {
                for (var e = 1; e < arguments.length; e++) {
                  var t = arguments[e]
                  for (var r in t)
                    ({}).hasOwnProperty.call(t, r) && (n[r] = t[r])
                }
                return n
              }),
          _extends.apply(null, arguments)
        )
      }
      const DialogCtx = React.createContext(null)

      /** Dialog — centered modal. Framework-agnostic reimplementation of packages/ui/src/dialog.tsx (Radix Dialog). */
      function Dialog({ open, onOpenChange, children }) {
        const [internalOpen, setInternalOpen] = React.useState(false)
        const isOpen = open !== undefined ? open : internalOpen
        const setOpen = onOpenChange || setInternalOpen
        return /*#__PURE__*/ React.createElement(
          DialogCtx.Provider,
          {
            value: {
              open: isOpen,
              setOpen,
            },
          },
          children,
        )
      }
      function DialogTrigger({ asChild, children, ...props }) {
        const ctx = React.useContext(DialogCtx)
        const onClick = (e) => {
          children?.props?.onClick?.(e)
          props.onClick?.(e)
          ctx.setOpen(true)
        }
        if (asChild && React.isValidElement(children))
          return React.cloneElement(children, {
            onClick,
          })
        return /*#__PURE__*/ React.createElement(
          'button',
          _extends(
            {
              type: 'button',
              onClick: onClick,
            },
            props,
          ),
          children,
        )
      }
      function DialogClose({ asChild, children, ...props }) {
        const ctx = React.useContext(DialogCtx)
        const onClick = (e) => {
          children?.props?.onClick?.(e)
          props.onClick?.(e)
          ctx.setOpen(false)
        }
        if (asChild && React.isValidElement(children))
          return React.cloneElement(children, {
            onClick,
          })
        return /*#__PURE__*/ React.createElement(
          'button',
          _extends(
            {
              type: 'button',
              onClick: onClick,
            },
            props,
          ),
          children,
        )
      }
      function DialogContent({ className, style, children, ...props }) {
        const ctx = React.useContext(DialogCtx)
        if (!ctx.open) return null
        return /*#__PURE__*/ React.createElement(
          'div',
          {
            style: {
              position: 'fixed',
              inset: 0,
              zIndex: 50,
              background: 'rgb(0 0 0 / 0.8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            },
            onClick: () => ctx.setOpen(false),
          },
          /*#__PURE__*/ React.createElement(
            'div',
            _extends(
              {
                className: className,
                onClick: (e) => e.stopPropagation(),
                style: {
                  position: 'relative',
                  background: 'hsl(var(--background))',
                  color: 'hsl(var(--foreground))',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid hsl(var(--border))',
                  boxShadow: 'var(--shadow-lg)',
                  padding: 24,
                  width: '100%',
                  maxWidth: 500,
                  maxHeight: 'calc(100dvh - 2rem)',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 16,
                  fontFamily: 'var(--font-sans)',
                  ...style,
                },
              },
              props,
            ),
            children,
            /*#__PURE__*/ React.createElement(
              'button',
              {
                type: 'button',
                onClick: () => ctx.setOpen(false),
                'aria-label': 'Close',
                style: {
                  position: 'absolute',
                  top: 16,
                  right: 16,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'hsl(var(--muted-foreground))',
                  fontSize: 16,
                  lineHeight: 1,
                },
              },
              '\u2715',
            ),
          ),
        )
      }
      function DialogHeader({ style, children, ...props }) {
        return /*#__PURE__*/ React.createElement(
          'div',
          _extends(
            {
              style: {
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                textAlign: 'left',
                ...style,
              },
            },
            props,
          ),
          children,
        )
      }
      function DialogFooter({ style, children, ...props }) {
        return /*#__PURE__*/ React.createElement(
          'div',
          _extends(
            {
              style: {
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 8,
                ...style,
              },
            },
            props,
          ),
          children,
        )
      }
      function DialogTitle({ style, children, ...props }) {
        return /*#__PURE__*/ React.createElement(
          'h2',
          _extends(
            {
              style: {
                fontSize: 18,
                fontWeight: 600,
                lineHeight: 1,
                margin: 0,
                letterSpacing: '-0.01em',
                ...style,
              },
            },
            props,
          ),
          children,
        )
      }
      function DialogDescription({ style, children, ...props }) {
        return /*#__PURE__*/ React.createElement(
          'p',
          _extends(
            {
              style: {
                fontSize: 14,
                color: 'hsl(var(--muted-foreground))',
                margin: 0,
                ...style,
              },
            },
            props,
          ),
          children,
        )
      }
      Object.assign(__ds_scope, {
        Dialog,
        DialogTrigger,
        DialogClose,
        DialogContent,
        DialogHeader,
        DialogFooter,
        DialogTitle,
        DialogDescription,
      })
    })()
  } catch (e) {
    __ds_ns.__errors.push({
      path: 'components/overlay/Dialog.jsx',
      error: String((e && e.message) || e),
    })
  }

  // components/overlay/DropdownMenu.jsx
  try {
    ;(() => {
      function _extends() {
        return (
          (_extends = Object.assign
            ? Object.assign.bind()
            : function (n) {
                for (var e = 1; e < arguments.length; e++) {
                  var t = arguments[e]
                  for (var r in t)
                    ({}).hasOwnProperty.call(t, r) && (n[r] = t[r])
                }
                return n
              }),
          _extends.apply(null, arguments)
        )
      }
      const MenuCtx = React.createContext(null)

      /** DropdownMenu — trigger + floating panel. Reimplementation of packages/ui/src/dropdown-menu.tsx (Radix DropdownMenu). */
      function DropdownMenu({ children }) {
        const [open, setOpen] = React.useState(false)
        const ref = React.useRef(null)
        React.useEffect(() => {
          if (!open) return
          const onDocClick = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false)
          }
          document.addEventListener('mousedown', onDocClick)
          return () => document.removeEventListener('mousedown', onDocClick)
        }, [open])
        return /*#__PURE__*/ React.createElement(
          'div',
          {
            ref: ref,
            style: {
              position: 'relative',
              display: 'inline-block',
            },
          },
          /*#__PURE__*/ React.createElement(
            MenuCtx.Provider,
            {
              value: {
                open,
                setOpen,
              },
            },
            children,
          ),
        )
      }
      function DropdownMenuTrigger({ asChild, children, ...props }) {
        const ctx = React.useContext(MenuCtx)
        const onClick = (e) => {
          children?.props?.onClick?.(e)
          props.onClick?.(e)
          ctx.setOpen((o) => !o)
        }
        if (asChild && React.isValidElement(children))
          return React.cloneElement(children, {
            onClick,
          })
        return /*#__PURE__*/ React.createElement(
          'button',
          _extends(
            {
              type: 'button',
              onClick: onClick,
            },
            props,
          ),
          children,
        )
      }
      function DropdownMenuContent({
        align = 'start',
        className,
        style,
        children,
        ...props
      }) {
        const ctx = React.useContext(MenuCtx)
        if (!ctx.open) return null
        return /*#__PURE__*/ React.createElement(
          'div',
          _extends(
            {
              className: className,
              style: {
                position: 'absolute',
                top: '100%',
                marginTop: 4,
                zIndex: 50,
                minWidth: 160,
                background: 'hsl(var(--popover))',
                color: 'hsl(var(--popover-foreground))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-md)',
                padding: 4,
                fontFamily: 'var(--font-sans)',
                fontSize: 14,
                ...(align === 'end'
                  ? {
                      right: 0,
                    }
                  : {
                      left: 0,
                    }),
                ...style,
              },
            },
            props,
          ),
          children,
        )
      }
      function DropdownMenuItem({
        onClick,
        className,
        style,
        children,
        ...props
      }) {
        const ctx = React.useContext(MenuCtx)
        const [hover, setHover] = React.useState(false)
        return /*#__PURE__*/ React.createElement(
          'div',
          _extends(
            {
              role: 'menuitem',
              className: className,
              onMouseEnter: () => setHover(true),
              onMouseLeave: () => setHover(false),
              onClick: (e) => {
                onClick?.(e)
                ctx.setOpen(false)
              },
              style: {
                padding: '6px 8px',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                background: hover ? 'hsl(var(--accent))' : 'transparent',
                color: hover ? 'hsl(var(--accent-foreground))' : 'inherit',
                ...style,
              },
            },
            props,
          ),
          children,
        )
      }
      function DropdownMenuSeparator({ style, ...props }) {
        return /*#__PURE__*/ React.createElement(
          'div',
          _extends(
            {
              style: {
                height: 1,
                background: 'hsl(var(--muted))',
                margin: '4px -4px',
                ...style,
              },
            },
            props,
          ),
        )
      }
      function DropdownMenuLabel({ style, children, ...props }) {
        return /*#__PURE__*/ React.createElement(
          'div',
          _extends(
            {
              style: {
                padding: '6px 8px',
                fontSize: 13,
                fontWeight: 600,
                ...style,
              },
            },
            props,
          ),
          children,
        )
      }
      Object.assign(__ds_scope, {
        DropdownMenu,
        DropdownMenuTrigger,
        DropdownMenuContent,
        DropdownMenuItem,
        DropdownMenuSeparator,
        DropdownMenuLabel,
      })
    })()
  } catch (e) {
    __ds_ns.__errors.push({
      path: 'components/overlay/DropdownMenu.jsx',
      error: String((e && e.message) || e),
    })
  }

  // components/overlay/Sheet.jsx
  try {
    ;(() => {
      function _extends() {
        return (
          (_extends = Object.assign
            ? Object.assign.bind()
            : function (n) {
                for (var e = 1; e < arguments.length; e++) {
                  var t = arguments[e]
                  for (var r in t)
                    ({}).hasOwnProperty.call(t, r) && (n[r] = t[r])
                }
                return n
              }),
          _extends.apply(null, arguments)
        )
      }
      const SheetCtx = React.createContext(null)
      const sideStyle = {
        top: {
          top: 0,
          left: 0,
          right: 0,
          borderBottom: '1px solid hsl(var(--border))',
        },
        bottom: {
          bottom: 0,
          left: 0,
          right: 0,
          borderTop: '1px solid hsl(var(--border))',
        },
        left: {
          top: 0,
          bottom: 0,
          left: 0,
          width: '75%',
          maxWidth: 384,
          borderRight: '1px solid hsl(var(--border))',
        },
        right: {
          top: 0,
          bottom: 0,
          right: 0,
          width: '75%',
          maxWidth: 384,
          borderLeft: '1px solid hsl(var(--border))',
        },
      }

      /** Sheet — panel anchored to a screen edge (mobile nav, filters). Same Radix Dialog semantics as Dialog.jsx, anchored instead of centered. */
      function Sheet({ open, onOpenChange, children }) {
        const [internalOpen, setInternalOpen] = React.useState(false)
        const isOpen = open !== undefined ? open : internalOpen
        const setOpen = onOpenChange || setInternalOpen
        return /*#__PURE__*/ React.createElement(
          SheetCtx.Provider,
          {
            value: {
              open: isOpen,
              setOpen,
            },
          },
          children,
        )
      }
      function SheetTrigger({ asChild, children, ...props }) {
        const ctx = React.useContext(SheetCtx)
        const onClick = (e) => {
          children?.props?.onClick?.(e)
          props.onClick?.(e)
          ctx.setOpen(true)
        }
        if (asChild && React.isValidElement(children))
          return React.cloneElement(children, {
            onClick,
          })
        return /*#__PURE__*/ React.createElement(
          'button',
          _extends(
            {
              type: 'button',
              onClick: onClick,
            },
            props,
          ),
          children,
        )
      }
      function SheetClose(props) {
        const ctx = React.useContext(SheetCtx)
        return /*#__PURE__*/ React.createElement(
          'button',
          _extends(
            {
              type: 'button',
              onClick: () => ctx.setOpen(false),
            },
            props,
          ),
        )
      }
      function SheetContent({
        side = 'right',
        className,
        style,
        children,
        ...props
      }) {
        const ctx = React.useContext(SheetCtx)
        if (!ctx.open) return null
        return /*#__PURE__*/ React.createElement(
          'div',
          {
            style: {
              position: 'fixed',
              inset: 0,
              zIndex: 50,
              background: 'rgb(0 0 0 / 0.8)',
            },
            onClick: () => ctx.setOpen(false),
          },
          /*#__PURE__*/ React.createElement(
            'div',
            _extends(
              {
                className: className,
                onClick: (e) => e.stopPropagation(),
                style: {
                  position: 'fixed',
                  background: 'hsl(var(--background))',
                  color: 'hsl(var(--foreground))',
                  padding: 24,
                  boxShadow: 'var(--shadow-lg)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 16,
                  fontFamily: 'var(--font-sans)',
                  ...sideStyle[side],
                  ...style,
                },
              },
              props,
            ),
            children,
            /*#__PURE__*/ React.createElement(
              'button',
              {
                type: 'button',
                onClick: () => ctx.setOpen(false),
                'aria-label': 'Fechar',
                style: {
                  position: 'absolute',
                  top: 16,
                  right: 16,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'hsl(var(--muted-foreground))',
                },
              },
              '\u2715',
            ),
          ),
        )
      }
      function SheetHeader({ style, children, ...props }) {
        return /*#__PURE__*/ React.createElement(
          'div',
          _extends(
            {
              style: {
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                ...style,
              },
            },
            props,
          ),
          children,
        )
      }
      function SheetTitle({ style, children, ...props }) {
        return /*#__PURE__*/ React.createElement(
          'h2',
          _extends(
            {
              style: {
                fontSize: 18,
                fontWeight: 600,
                margin: 0,
                ...style,
              },
            },
            props,
          ),
          children,
        )
      }
      function SheetDescription({ style, children, ...props }) {
        return /*#__PURE__*/ React.createElement(
          'p',
          _extends(
            {
              style: {
                fontSize: 14,
                color: 'hsl(var(--muted-foreground))',
                margin: 0,
                ...style,
              },
            },
            props,
          ),
          children,
        )
      }
      Object.assign(__ds_scope, {
        Sheet,
        SheetTrigger,
        SheetClose,
        SheetContent,
        SheetHeader,
        SheetTitle,
        SheetDescription,
      })
    })()
  } catch (e) {
    __ds_ns.__errors.push({
      path: 'components/overlay/Sheet.jsx',
      error: String((e && e.message) || e),
    })
  }

  // ui_kits/portfolio/Bio.jsx
  try {
    ;(() => {
      function VisitCardMark({ className }) {
        return /*#__PURE__*/ React.createElement(
          'svg',
          {
            width: '22',
            height: '22',
            viewBox: '0 0 22 22',
            className: className,
            'aria-hidden': true,
          },
          /*#__PURE__*/ React.createElement('rect', {
            x: '1',
            y: '9',
            width: '7',
            height: '7',
            rx: '1',
            fill: 'currentColor',
          }),
          /*#__PURE__*/ React.createElement('rect', {
            x: '9',
            y: '9',
            width: '7',
            height: '7',
            rx: '1',
            fill: 'currentColor',
          }),
          /*#__PURE__*/ React.createElement('rect', {
            x: '9',
            y: '1',
            width: '7',
            height: '7',
            rx: '1',
            fill: 'currentColor',
          }),
        )
      }
      function VisitCardSurface({ profile, socials }) {
        const cells = socials.slice(0, 8)
        while (cells.length < 8) cells.push(null)
        return /*#__PURE__*/ React.createElement(
          'div',
          {
            style: {
              width: '100%',
              borderRadius: 24,
              border: '1px solid hsl(var(--border))',
              background: 'hsl(var(--card))',
              color: 'hsl(var(--card-foreground))',
              padding: 28,
              boxShadow: 'var(--shadow-ds)',
            },
          },
          /*#__PURE__*/ React.createElement(
            'div',
            {
              style: {
                display: 'flex',
                gap: 16,
                alignItems: 'flex-start',
              },
            },
            /*#__PURE__*/ React.createElement(
              'div',
              {
                style: {
                  width: 112,
                  height: 112,
                  borderRadius: '50%',
                  overflow: 'hidden',
                  flexShrink: 0,
                  border: '1px solid hsl(var(--border))',
                },
              },
              /*#__PURE__*/ React.createElement('img', {
                src: profile.avatarSrc,
                alt: profile.displayName,
                style: {
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                },
              }),
            ),
            /*#__PURE__*/ React.createElement(
              'div',
              {
                style: {
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4,1fr)',
                  gap: 8,
                  flex: 1,
                },
              },
              cells.map((s, i) =>
                s
                  ? /*#__PURE__*/ React.createElement(
                      'a',
                      {
                        key: s.id,
                        href: s.href,
                        target: '_blank',
                        rel: 'noreferrer',
                        'aria-label': s.label,
                        style: {
                          aspectRatio: '1/1',
                          borderRadius: 16,
                          border: '1px solid hsl(var(--border))',
                          background: 'hsl(var(--card))',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 20,
                          color: 'hsl(var(--foreground))',
                        },
                      },
                      s.image
                        ? /*#__PURE__*/ React.createElement('img', {
                            src: s.image,
                            alt: '',
                            style: {
                              width: 24,
                              height: 24,
                              objectFit: 'contain',
                            },
                          })
                        : /*#__PURE__*/ React.createElement('i', {
                            className: s.icon,
                          }),
                    )
                  : /*#__PURE__*/ React.createElement('div', {
                      key: 'e' + i,
                      style: {
                        aspectRatio: '1/1',
                        borderRadius: 16,
                        background: 'hsl(var(--muted) / 0.6)',
                      },
                    }),
              ),
            ),
          ),
          /*#__PURE__*/ React.createElement(
            'div',
            {
              style: {
                marginTop: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              },
            },
            /*#__PURE__*/ React.createElement(
              'p',
              {
                style: {
                  fontSize: 18,
                  fontWeight: 600,
                  margin: 0,
                },
              },
              profile.handle,
            ),
            /*#__PURE__*/ React.createElement(VisitCardMark, null),
          ),
        )
      }
      window.Bio = function Bio({ data, theme, setTheme }) {
        const {
          Avatar,
          AvatarImage,
          AvatarFallback,
          Dialog,
          DialogContent,
          DialogTitle,
          Button,
          DropdownMenu,
          DropdownMenuTrigger,
          DropdownMenuContent,
          DropdownMenuItem,
        } = window.PiluVituDesignSystem_c5cbcc
        const [open3d, setOpen3d] = React.useState(false)
        const [emailOpen, setEmailOpen] = React.useState(false)
        const clickCount = React.useRef(0)
        const timer = React.useRef(null)
        const { profile, socials } = data
        const onAvatarClick = () => {
          if (timer.current) clearTimeout(timer.current)
          clickCount.current += 1
          if (clickCount.current >= 3) {
            clickCount.current = 0
            setOpen3d(true)
            return
          }
          timer.current = setTimeout(() => {
            clickCount.current = 0
          }, 650)
        }
        return /*#__PURE__*/ React.createElement(
          'div',
          {
            style: {
              display: 'flex',
              flexDirection: 'column',
              gap: 24,
            },
          },
          /*#__PURE__*/ React.createElement(
            'div',
            {
              style: {
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 16,
              },
            },
            /*#__PURE__*/ React.createElement(
              'button',
              {
                type: 'button',
                onClick: onAvatarClick,
                'aria-label':
                  'Foto de perfil \u2014 triplo clique para abrir o cart\xE3o de visita',
                style: {
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  padding: 0,
                },
              },
              /*#__PURE__*/ React.createElement(
                Avatar,
                {
                  style: {
                    width: 96,
                    height: 96,
                    borderRadius: 'var(--radius-lg)',
                  },
                },
                /*#__PURE__*/ React.createElement(AvatarImage, {
                  src: profile.avatarSrc,
                  alt: profile.displayName,
                }),
                /*#__PURE__*/ React.createElement(
                  AvatarFallback,
                  {
                    style: {
                      borderRadius: 'var(--radius-lg)',
                    },
                  },
                  'PV',
                ),
              ),
            ),
            /*#__PURE__*/ React.createElement(
              DropdownMenu,
              null,
              /*#__PURE__*/ React.createElement(
                DropdownMenuTrigger,
                {
                  asChild: true,
                },
                /*#__PURE__*/ React.createElement(
                  Button,
                  {
                    variant: 'outline',
                    style: {
                      borderRadius: 'var(--radius-pill)',
                      padding: '0 16px',
                    },
                  },
                  theme === 'dark' ? '🌙 Tema' : '☀️ Tema',
                ),
              ),
              /*#__PURE__*/ React.createElement(
                DropdownMenuContent,
                {
                  align: 'end',
                },
                /*#__PURE__*/ React.createElement(
                  DropdownMenuItem,
                  {
                    onClick: () => setTheme('light'),
                  },
                  'Light',
                ),
                /*#__PURE__*/ React.createElement(
                  DropdownMenuItem,
                  {
                    onClick: () => setTheme('dark'),
                  },
                  'Dark',
                ),
              ),
            ),
          ),
          /*#__PURE__*/ React.createElement(
            'p',
            {
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                color: 'hsl(var(--muted-foreground))',
                margin: 0,
              },
            },
            /*#__PURE__*/ React.createElement('span', {
              style: {
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: 'hsl(var(--ok))',
                display: 'inline-block',
              },
            }),
            profile.availabilityLabel,
          ),
          /*#__PURE__*/ React.createElement(
            'h1',
            {
              style: {
                fontSize: 40,
                fontWeight: 800,
                letterSpacing: '-0.02em',
                lineHeight: 1.1,
                margin: 0,
              },
            },
            profile.displayName,
          ),
          /*#__PURE__*/ React.createElement(
            'div',
            {
              style: {
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
              },
            },
            /*#__PURE__*/ React.createElement(
              'p',
              {
                style: {
                  margin: 0,
                },
              },
              /*#__PURE__*/ React.createElement(
                'strong',
                {
                  style: {
                    color: 'hsl(var(--primary))',
                    fontWeight: 600,
                  },
                },
                profile.roleHighlight,
              ),
              ' na ',
              /*#__PURE__*/ React.createElement(
                'a',
                {
                  href: profile.companyLink,
                  target: '_blank',
                  rel: 'noreferrer',
                  style: {
                    color: profile.companyLinkColor,
                    fontWeight: 600,
                  },
                },
                profile.companyName,
              ),
            ),
            /*#__PURE__*/ React.createElement(
              'p',
              {
                style: {
                  color: 'hsl(var(--muted-foreground))',
                  margin: 0,
                },
              },
              profile.bio,
            ),
            /*#__PURE__*/ React.createElement(
              'nav',
              {
                'aria-label': 'Redes sociais e contato',
                style: {
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  paddingTop: 8,
                },
              },
              socials.map((s) =>
                /*#__PURE__*/ React.createElement(
                  'a',
                  {
                    key: s.id,
                    href: s.href,
                    target: '_blank',
                    rel: 'noreferrer',
                    'aria-label': s.label,
                    style: {
                      width: 48,
                      height: 48,
                      borderRadius: 12,
                      border: '1px solid hsl(var(--border))',
                      background: 'hsl(var(--card))',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 20,
                      color: 'hsl(var(--foreground))',
                    },
                  },
                  s.image
                    ? /*#__PURE__*/ React.createElement('img', {
                        src: s.image,
                        alt: '',
                        style: {
                          width: 24,
                          height: 24,
                          objectFit: 'contain',
                        },
                      })
                    : /*#__PURE__*/ React.createElement('i', {
                        className: s.icon,
                      }),
                ),
              ),
              /*#__PURE__*/ React.createElement(
                'button',
                {
                  type: 'button',
                  onClick: () => setEmailOpen(true),
                  'aria-label': 'Enviar email',
                  style: {
                    width: 48,
                    height: 48,
                    borderRadius: 12,
                    border: '1px solid hsl(var(--border))',
                    background: 'hsl(var(--card))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 20,
                    color: 'hsl(var(--foreground))',
                    cursor: 'pointer',
                  },
                },
                /*#__PURE__*/ React.createElement('i', {
                  className: 'fa-solid fa-envelope',
                }),
              ),
            ),
            /*#__PURE__*/ React.createElement(
              'div',
              {
                style: {
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  paddingTop: 8,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 14,
                  color: 'hsl(var(--muted-foreground))',
                },
              },
              /*#__PURE__*/ React.createElement(
                'span',
                {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  },
                },
                /*#__PURE__*/ React.createElement('i', {
                  className: 'fa-solid fa-location-dot',
                  style: {
                    fontSize: 14,
                  },
                }),
                profile.location,
              ),
              /*#__PURE__*/ React.createElement(
                'span',
                {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  },
                },
                /*#__PURE__*/ React.createElement('i', {
                  className: 'fa-solid fa-briefcase',
                  style: {
                    fontSize: 14,
                  },
                }),
                profile.disciplines.join(' · '),
              ),
            ),
          ),
          /*#__PURE__*/ React.createElement(
            Dialog,
            {
              open: open3d,
              onOpenChange: setOpen3d,
            },
            /*#__PURE__*/ React.createElement(
              DialogContent,
              {
                style: {
                  background: 'transparent',
                  border: 'none',
                  boxShadow: 'none',
                  maxWidth: 440,
                },
              },
              /*#__PURE__*/ React.createElement(
                DialogTitle,
                {
                  style: {
                    position: 'absolute',
                    width: 1,
                    height: 1,
                    overflow: 'hidden',
                  },
                },
                'Cart\xE3o de visita em 3D',
              ),
              /*#__PURE__*/ React.createElement(
                'div',
                {
                  style: {
                    perspective: 1400,
                  },
                },
                /*#__PURE__*/ React.createElement(
                  'div',
                  {
                    style: {
                      animation: 'visit-card-3d-wobble 7s ease-in-out infinite',
                      transformStyle: 'preserve-3d',
                    },
                  },
                  /*#__PURE__*/ React.createElement(VisitCardSurface, {
                    profile: profile,
                    socials: socials,
                  }),
                ),
              ),
            ),
          ),
          /*#__PURE__*/ React.createElement(
            Dialog,
            {
              open: emailOpen,
              onOpenChange: setEmailOpen,
            },
            /*#__PURE__*/ React.createElement(
              DialogContent,
              null,
              /*#__PURE__*/ React.createElement(
                DialogTitle,
                null,
                'Me mande um email',
              ),
              /*#__PURE__*/ React.createElement(
                'div',
                {
                  style: {
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 14,
                  },
                },
                /*#__PURE__*/ React.createElement('input', {
                  placeholder: 'Seu nome',
                  style: {
                    height: 36,
                    borderRadius: 8,
                    border: '1px solid hsl(var(--input))',
                    padding: '0 12px',
                    background: 'transparent',
                    color: 'hsl(var(--foreground))',
                  },
                }),
                /*#__PURE__*/ React.createElement('input', {
                  placeholder: 'seu@email.com',
                  style: {
                    height: 36,
                    borderRadius: 8,
                    border: '1px solid hsl(var(--input))',
                    padding: '0 12px',
                    background: 'transparent',
                    color: 'hsl(var(--foreground))',
                  },
                }),
                /*#__PURE__*/ React.createElement('textarea', {
                  placeholder: 'Digite sua mensagem aqui',
                  rows: 3,
                  style: {
                    borderRadius: 8,
                    border: '1px solid hsl(var(--input))',
                    padding: '8px 12px',
                    background: 'transparent',
                    color: 'hsl(var(--foreground))',
                    resize: 'none',
                  },
                }),
                /*#__PURE__*/ React.createElement(
                  Button,
                  {
                    onClick: () => setEmailOpen(false),
                  },
                  'Enviar',
                ),
              ),
            ),
          ),
        )
      }
    })()
  } catch (e) {
    __ds_ns.__errors.push({
      path: 'ui_kits/portfolio/Bio.jsx',
      error: String((e && e.message) || e),
    })
  }

  // ui_kits/portfolio/HomeSections.jsx
  try {
    ;(() => {
      function pad(n) {
        return String(n).padStart(2, '0')
      }
      function SectionHeader({ label, count }) {
        return /*#__PURE__*/ React.createElement(
          'div',
          {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            },
          },
          /*#__PURE__*/ React.createElement(
            'h2',
            {
              style: {
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: 'hsl(var(--muted-foreground))',
                margin: 0,
              },
            },
            label,
          ),
          /*#__PURE__*/ React.createElement(
            'span',
            {
              style: {
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                color: 'hsl(var(--muted-foreground))',
              },
            },
            pad(count),
          ),
          /*#__PURE__*/ React.createElement('span', {
            style: {
              flex: 1,
              height: 1,
              background: 'hsl(var(--border))',
            },
          }),
        )
      }
      function JobCard({ job }) {
        const {
          Dialog,
          DialogTrigger,
          DialogContent,
          DialogHeader,
          DialogTitle,
          DialogDescription,
          DialogFooter,
          Button,
          Avatar,
          AvatarFallback,
        } = window.PiluVituDesignSystem_c5cbcc
        const [hover, setHover] = React.useState(false)
        const logo = /*#__PURE__*/ React.createElement(
          Avatar,
          {
            style: {
              width: 40,
              height: 40,
              borderRadius: 'var(--radius-md)',
            },
          },
          /*#__PURE__*/ React.createElement(
            AvatarFallback,
            {
              style: {
                background: 'hsl(var(--accent-soft))',
                color: 'hsl(var(--primary))',
                fontWeight: 700,
                fontSize: 12,
              },
            },
            job.altImage,
          ),
        )
        return /*#__PURE__*/ React.createElement(
          Dialog,
          null,
          /*#__PURE__*/ React.createElement(
            DialogTrigger,
            {
              asChild: true,
            },
            /*#__PURE__*/ React.createElement(
              'button',
              {
                type: 'button',
                onMouseEnter: () => setHover(true),
                onMouseLeave: () => setHover(false),
                style: {
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  textAlign: 'left',
                  width: '100%',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 'var(--radius-md)',
                  padding: 20,
                  background: hover ? 'hsl(var(--accent))' : 'hsl(var(--card))',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                  color: 'inherit',
                },
              },
              /*#__PURE__*/ React.createElement(
                'div',
                {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  },
                },
                logo,
                /*#__PURE__*/ React.createElement(
                  'div',
                  {
                    style: {
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                    },
                  },
                  /*#__PURE__*/ React.createElement(
                    'span',
                    {
                      style: {
                        fontWeight: 600,
                        lineHeight: 1.3,
                      },
                    },
                    job.orgName,
                  ),
                  /*#__PURE__*/ React.createElement(
                    'span',
                    {
                      style: {
                        fontFamily: 'var(--font-mono)',
                        fontSize: 12,
                        color: 'hsl(var(--muted-foreground))',
                      },
                    },
                    job.date,
                  ),
                ),
              ),
              /*#__PURE__*/ React.createElement(
                'p',
                {
                  style: {
                    fontSize: 14,
                    margin: 0,
                  },
                },
                job.title,
              ),
              /*#__PURE__*/ React.createElement(
                'div',
                {
                  style: {
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: 8,
                  },
                },
                job.current &&
                  /*#__PURE__*/ React.createElement(
                    'span',
                    {
                      style: {
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        borderRadius: 999,
                        border: '1px solid hsl(var(--border))',
                        padding: '2px 10px',
                        fontSize: 12,
                      },
                    },
                    /*#__PURE__*/ React.createElement('span', {
                      style: {
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: 'hsl(var(--ok))',
                      },
                    }),
                    'Atual',
                  ),
                job.tags.map((t) =>
                  /*#__PURE__*/ React.createElement(
                    'span',
                    {
                      key: t,
                      style: {
                        borderRadius: 999,
                        border: '1px solid hsl(var(--border))',
                        padding: '2px 10px',
                        fontSize: 12,
                      },
                    },
                    t,
                  ),
                ),
                /*#__PURE__*/ React.createElement(
                  'span',
                  {
                    style: {
                      marginLeft: 'auto',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 12,
                      color: 'hsl(var(--primary))',
                    },
                  },
                  'detalhes \u2192',
                ),
              ),
            ),
          ),
          /*#__PURE__*/ React.createElement(
            DialogContent,
            null,
            /*#__PURE__*/ React.createElement(
              DialogHeader,
              null,
              /*#__PURE__*/ React.createElement(
                'div',
                {
                  style: {
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 16,
                  },
                },
                logo,
                /*#__PURE__*/ React.createElement(
                  'div',
                  null,
                  /*#__PURE__*/ React.createElement(
                    DialogTitle,
                    {
                      style: {
                        fontSize: 20,
                      },
                    },
                    job.orgName,
                  ),
                  /*#__PURE__*/ React.createElement(
                    'p',
                    {
                      style: {
                        fontFamily: 'var(--font-mono)',
                        fontSize: 12,
                        color: 'hsl(var(--muted-foreground))',
                        margin: '4px 0 0',
                      },
                    },
                    job.title,
                    ' \xB7 ',
                    job.date,
                  ),
                ),
              ),
              /*#__PURE__*/ React.createElement(
                DialogDescription,
                {
                  style: {
                    color: 'hsl(var(--primary))',
                    fontSize: 15,
                    paddingTop: 8,
                  },
                },
                job.orgDescription,
              ),
            ),
            /*#__PURE__*/ React.createElement(
              'div',
              {
                style: {
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                },
              },
              /*#__PURE__*/ React.createElement(
                'p',
                {
                  style: {
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    letterSpacing: '0.2em',
                    textTransform: 'uppercase',
                    color: 'hsl(var(--muted-foreground))',
                    margin: 0,
                  },
                },
                'Atribui\xE7\xF5es',
              ),
              /*#__PURE__*/ React.createElement(
                'ul',
                {
                  style: {
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    margin: 0,
                    padding: 0,
                    listStyle: 'none',
                  },
                },
                job.atribuitions.map((a) =>
                  /*#__PURE__*/ React.createElement(
                    'li',
                    {
                      key: a,
                      style: {
                        display: 'flex',
                        gap: 10,
                        fontSize: 14,
                      },
                    },
                    /*#__PURE__*/ React.createElement('span', {
                      style: {
                        width: 6,
                        height: 6,
                        marginTop: 6,
                        flexShrink: 0,
                        borderRadius: 2,
                        background: 'hsl(var(--primary))',
                      },
                    }),
                    /*#__PURE__*/ React.createElement('span', null, a),
                  ),
                ),
              ),
            ),
          ),
        )
      }
      function ProjectCard({ project }) {
        const { Card, Avatar, AvatarImage, AvatarFallback, Button } =
          window.PiluVituDesignSystem_c5cbcc
        return /*#__PURE__*/ React.createElement(
          Card,
          {
            style: {
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
              padding: 24,
            },
          },
          /*#__PURE__*/ React.createElement(
            'div',
            {
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: 14,
              },
            },
            /*#__PURE__*/ React.createElement(
              Avatar,
              {
                style: {
                  width: 48,
                  height: 48,
                  borderRadius: 'var(--radius-md)',
                  background: 'hsl(var(--accent-soft))',
                },
              },
              /*#__PURE__*/ React.createElement(AvatarImage, {
                src: project.logo,
                alt: project.projectName,
                style: {
                  objectFit: 'contain',
                  padding: 6,
                },
              }),
              /*#__PURE__*/ React.createElement(
                AvatarFallback,
                {
                  style: {
                    background: 'hsl(var(--accent-soft))',
                    color: 'hsl(var(--primary))',
                    fontWeight: 700,
                  },
                },
                project.altImage,
              ),
            ),
            /*#__PURE__*/ React.createElement(
              'div',
              {
                style: {
                  display: 'flex',
                  flexDirection: 'column',
                },
              },
              /*#__PURE__*/ React.createElement(
                'h3',
                {
                  style: {
                    fontSize: 20,
                    fontWeight: 700,
                    margin: 0,
                  },
                },
                project.projectName,
              ),
              project.subtitle &&
                /*#__PURE__*/ React.createElement(
                  'p',
                  {
                    style: {
                      fontSize: 13,
                      color: 'hsl(var(--muted-foreground))',
                      margin: 0,
                    },
                  },
                  project.subtitle,
                ),
            ),
          ),
          /*#__PURE__*/ React.createElement(
            'p',
            {
              style: {
                color: 'hsl(var(--muted-foreground))',
                margin: 0,
              },
            },
            project.description,
          ),
          /*#__PURE__*/ React.createElement(
            'div',
            {
              style: {
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
              },
            },
            project.tags.map((t) =>
              /*#__PURE__*/ React.createElement(
                'span',
                {
                  key: t,
                  style: {
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 999,
                    padding: '2px 10px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                  },
                },
                t,
              ),
            ),
          ),
          /*#__PURE__*/ React.createElement(
            'div',
            {
              style: {
                display: 'flex',
                flexWrap: 'wrap',
                gap: 10,
              },
            },
            project.deployLink &&
              /*#__PURE__*/ React.createElement(
                Button,
                {
                  as: 'a',
                  href: project.deployLink,
                  target: '_blank',
                  rel: 'noreferrer',
                },
                /*#__PURE__*/ React.createElement('i', {
                  className: 'fa-solid fa-arrow-up-right-from-square',
                  style: {
                    fontSize: 12,
                  },
                }),
                'Demo',
              ),
            project.repoLink &&
              /*#__PURE__*/ React.createElement(
                Button,
                {
                  as: 'a',
                  href: project.repoLink,
                  target: '_blank',
                  rel: 'noreferrer',
                  variant: 'outline',
                },
                /*#__PURE__*/ React.createElement('i', {
                  className: 'fa-solid fa-code',
                  style: {
                    fontSize: 12,
                  },
                }),
                'C\xF3digo',
              ),
          ),
        )
      }
      function ArticleCard({ article, index }) {
        const [hover, setHover] = React.useState(false)
        const kbd = article.source === 'devto' ? '~/dev' : '~/blog'
        return /*#__PURE__*/ React.createElement(
          'a',
          {
            href: article.href,
            target: '_blank',
            rel: 'noreferrer',
            onMouseEnter: () => setHover(true),
            onMouseLeave: () => setHover(false),
            style: {
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              height: '100%',
              border: '1px solid hsl(var(--border))',
              borderRadius: 'var(--radius-md)',
              padding: 20,
              background: hover ? 'hsl(var(--accent))' : 'hsl(var(--card))',
              color: 'inherit',
              textDecoration: 'none',
            },
          },
          /*#__PURE__*/ React.createElement(
            'div',
            {
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
              },
            },
            /*#__PURE__*/ React.createElement(
              'span',
              {
                style: {
                  background: 'hsl(var(--accent-soft))',
                  color: 'hsl(var(--primary))',
                  borderRadius: 4,
                  padding: '2px 6px',
                },
              },
              kbd,
            ),
            /*#__PURE__*/ React.createElement(
              'span',
              {
                style: {
                  color: 'hsl(var(--muted-foreground))',
                },
              },
              '\xB7 post ',
              pad(index + 1),
            ),
          ),
          /*#__PURE__*/ React.createElement(
            'h3',
            {
              style: {
                fontSize: 18,
                fontWeight: 600,
                margin: 0,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              },
            },
            article.title,
          ),
          /*#__PURE__*/ React.createElement(
            'div',
            {
              style: {
                marginTop: 'auto',
                display: 'flex',
                justifyContent: 'space-between',
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                color: 'hsl(var(--muted-foreground))',
              },
            },
            /*#__PURE__*/ React.createElement(
              'span',
              null,
              article.minutes,
              ' min de leitura',
            ),
            /*#__PURE__*/ React.createElement(
              'span',
              {
                style: {
                  color: 'hsl(var(--primary))',
                  transform: hover ? 'translateX(2px)' : 'none',
                  transition: 'transform .15s',
                },
              },
              'ler \u2192',
            ),
          ),
        )
      }
      window.HomeSections = function HomeSections({ data }) {
        return /*#__PURE__*/ React.createElement(
          'div',
          {
            style: {
              display: 'flex',
              flexDirection: 'column',
              gap: 48,
            },
          },
          /*#__PURE__*/ React.createElement(
            'section',
            {
              style: {
                display: 'flex',
                flexDirection: 'column',
                gap: 20,
              },
            },
            /*#__PURE__*/ React.createElement(SectionHeader, {
              label: 'Carreira',
              count: data.carreiras.length,
            }),
            /*#__PURE__*/ React.createElement(
              'div',
              {
                style: {
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                  gap: 14,
                },
              },
              data.carreiras.map((j) =>
                /*#__PURE__*/ React.createElement(JobCard, {
                  key: j.id,
                  job: j,
                }),
              ),
            ),
          ),
          /*#__PURE__*/ React.createElement(
            'section',
            {
              style: {
                display: 'flex',
                flexDirection: 'column',
                gap: 20,
              },
            },
            /*#__PURE__*/ React.createElement(SectionHeader, {
              label: 'Projetos',
              count: data.projects.length,
            }),
            /*#__PURE__*/ React.createElement(
              'div',
              {
                style: {
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: 24,
                },
              },
              data.projects.map((p) =>
                /*#__PURE__*/ React.createElement(ProjectCard, {
                  key: p.id,
                  project: p,
                }),
              ),
            ),
          ),
          /*#__PURE__*/ React.createElement(
            'section',
            {
              style: {
                display: 'flex',
                flexDirection: 'column',
                gap: 20,
              },
            },
            /*#__PURE__*/ React.createElement(SectionHeader, {
              label: 'Artigos',
              count: data.articles.length,
            }),
            /*#__PURE__*/ React.createElement(
              'div',
              {
                style: {
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                  gap: 24,
                },
              },
              data.articles.map((a, i) =>
                /*#__PURE__*/ React.createElement(ArticleCard, {
                  key: a.id,
                  article: a,
                  index: i,
                }),
              ),
            ),
          ),
        )
      }
      window.HomeFooter = function HomeFooter({ name }) {
        const linkStyle = {
          color: 'hsl(var(--muted-foreground))',
          textDecoration: 'none',
        }
        return /*#__PURE__*/ React.createElement(
          'footer',
          {
            style: {
              marginTop: 8,
              borderTop: '1px solid hsl(var(--border))',
              paddingTop: 24,
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              gap: 8,
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              color: 'hsl(var(--muted-foreground))',
            },
          },
          /*#__PURE__*/ React.createElement(
            'span',
            null,
            '\xA9 ',
            new Date().getFullYear(),
            ' ',
            name,
          ),
          /*#__PURE__*/ React.createElement(
            'span',
            {
              style: {
                display: 'flex',
                gap: 8,
                flexWrap: 'wrap',
              },
            },
            /*#__PURE__*/ React.createElement('span', null, 'piluvitu.com.br'),
            /*#__PURE__*/ React.createElement(
              'span',
              {
                'aria-hidden': true,
              },
              '\xB7',
            ),
            /*#__PURE__*/ React.createElement(
              'a',
              {
                href: '#',
                style: linkStyle,
              },
              '/tools',
            ),
            /*#__PURE__*/ React.createElement(
              'span',
              {
                'aria-hidden': true,
              },
              '\xB7',
            ),
            /*#__PURE__*/ React.createElement(
              'a',
              {
                href: '#',
                style: linkStyle,
              },
              '/tasks',
            ),
            /*#__PURE__*/ React.createElement(
              'span',
              {
                'aria-hidden': true,
              },
              '\xB7',
            ),
            /*#__PURE__*/ React.createElement(
              'a',
              {
                href: '#',
                style: linkStyle,
              },
              '/vota\xE7\xE3o',
            ),
          ),
        )
      }
    })()
  } catch (e) {
    __ds_ns.__errors.push({
      path: 'ui_kits/portfolio/HomeSections.jsx',
      error: String((e && e.message) || e),
    })
  }

  // ui_kits/portfolio/data.js
  try {
    ;(() => {
      window.SITE_DATA = {
        profile: {
          displayName: 'Paulo Victor Torres Silva',
          avatarSrc: '../../assets/photos/profile.jpg',
          roleHighlight: 'Site Reliability Engineer (SRE)',
          companyName: 'ViralizePlus',
          companyLink: 'https://www.viralizeplus.com.br/',
          companyLinkColor: '#4a65fc',
          bio: 'DevOps Engineer com 3 anos de experiência focado em garantir que sistemas em nuvem operem com alta disponibilidade e custo eficiente. Especialista em transformar operações manuais em processos automatizados e seguros, monitorando a saúde das aplicações em tempo real e antecipando falhas antes que afetem o usuário final.',
          availabilityLabel: 'Disponível para oportunidades',
          location: 'Brasil · Remoto',
          disciplines: ['SRE', 'DevOps', 'Cloud'],
          handle: 'piluvitu',
        },
        socials: [
          {
            id: 'github',
            label: 'GitHub',
            icon: 'fa-brands fa-github',
            href: 'https://github.com/PiluVitu',
          },
          {
            id: 'linkedin',
            label: 'LinkedIn',
            icon: 'fa-brands fa-linkedin',
            href: 'https://linkedin.com',
          },
          {
            id: 'dev',
            label: 'DEV',
            icon: 'fa-brands fa-dev',
            href: 'https://dev.to/piluvitu',
          },
          {
            id: 'bsky',
            label: 'Bluesky',
            image: '../../assets/icons/bsky.png',
            href: 'https://bsky.app',
          },
          {
            id: 'instagram',
            label: 'Instagram',
            icon: 'fa-brands fa-instagram',
            href: 'https://instagram.com',
          },
          {
            id: 'whatsapp',
            label: 'WhatsApp',
            icon: 'fa-brands fa-whatsapp',
            href: 'https://wa.me',
          },
        ],
        carreiras: [
          {
            id: 'viralizeplus',
            orgName: 'ViralizePlus',
            altImage: 'VP',
            current: true,
            title: 'Site Reliability Engineer (SRE)',
            date: '2024 — atual',
            location: 'Remoto',
            tags: ['AWS', 'Terraform', 'Kubernetes'],
            orgDescription:
              'Plataforma de automação de WhatsApp para negócios.',
            atribuitions: [
              'Migração de infraestrutura manual para IaC (Terraform + Ansible), reduzindo tempo de provisionamento de dias para minutos.',
              'Implantação de observabilidade (Prometheus + Grafana + OpenTelemetry) com SLIs/SLOs definidos por serviço.',
              'Automação de CI/CD (GitHub Actions) cobrindo build, teste e deploy de 6 serviços em produção.',
            ],
          },
          {
            id: 'freelance',
            orgName: 'Freelance',
            altImage: 'FR',
            current: false,
            title: 'DevOps & Cloud Engineering',
            date: '2022 — 2024',
            location: 'Remoto',
            tags: ['Docker', 'CI/CD', 'Linux'],
            orgDescription:
              'Projetos pessoais e formação em nuvem e confiabilidade.',
            atribuitions: [
              'Containerização de aplicações legadas com Docker e orquestração via Docker Compose.',
              'Construção de pipelines CI/CD do zero para múltiplos projetos pessoais.',
            ],
          },
        ],
        projects: [
          {
            id: 'octopost',
            projectName: 'Octopost',
            altImage: 'OP',
            logo: '../../assets/logos/octopost.png',
            subtitle: 'Serviço open source',
            description:
              'Guia gratuito e automatizado para orientar novos desenvolvedores, criado pela comunidade DevHat.',
            tags: ['Go', 'Open Source'],
            deployLink: 'https://octopost.dev',
            repoLink: 'https://github.com/devhatt/octopost',
          },
          {
            id: 'live-prs',
            projectName: 'Live PRs',
            altImage: 'LP',
            logo: '../../assets/logos/live-prs.png',
            subtitle: 'Agregador de Pull Requests',
            description:
              'Agrega Pull Requests abertos do GitHub (e outros providers) em um painel único e ao vivo.',
            tags: ['TypeScript', 'Monorepo'],
            deployLink: '',
            repoLink: 'https://github.com/PiluVitu/live-prs',
          },
          {
            id: 'petdex',
            projectName: 'PetDex',
            altImage: 'PD',
            logo: '../../assets/logos/petdex.png',
            subtitle: 'Prontuário digital de pets',
            description:
              'Aplicação para cadastro e histórico de saúde de pets, com frontend e backend próprios.',
            tags: ['React', 'Node'],
            deployLink: '',
            repoLink: 'https://github.com/devhatt/pet-dex-frontend',
          },
          {
            id: 'git-fav',
            projectName: 'GitFav',
            altImage: 'GF',
            logo: '../../assets/logos/git-fav.png',
            subtitle: 'Favoritos do GitHub',
            description:
              'Aplicação de favoritos de perfis do GitHub, consumindo a API pública do GitHub.',
            tags: ['JavaScript', 'API'],
            deployLink: '',
            repoLink: 'https://github.com/PiluVitu/GitFav-Explorer',
          },
        ],
        articles: [
          {
            id: 1,
            title: 'Como medi SLIs e SLOs antes de prometer disponibilidade',
            source: 'devto',
            href: 'https://dev.to/piluvitu',
            minutes: 6,
          },
          {
            id: 2,
            title:
              'Terraform + Ansible: da VM manual à infraestrutura como código',
            source: 'devto',
            href: 'https://dev.to/piluvitu',
            minutes: 8,
          },
          {
            id: 3,
            title:
              'Observabilidade de verdade: Prometheus, Grafana e OpenTelemetry juntos',
            source: 'blog',
            href: '#',
            minutes: 5,
          },
        ],
      }
    })()
  } catch (e) {
    __ds_ns.__errors.push({
      path: 'ui_kits/portfolio/data.js',
      error: String((e && e.message) || e),
    })
  }

  __ds_ns.AspectRatio = __ds_scope.AspectRatio

  __ds_ns.Badge = __ds_scope.Badge

  __ds_ns.Button = __ds_scope.Button

  __ds_ns.Card = __ds_scope.Card

  __ds_ns.CardHeader = __ds_scope.CardHeader

  __ds_ns.CardTitle = __ds_scope.CardTitle

  __ds_ns.CardDescription = __ds_scope.CardDescription

  __ds_ns.CardContent = __ds_scope.CardContent

  __ds_ns.CardFooter = __ds_scope.CardFooter

  __ds_ns.Separator = __ds_scope.Separator

  __ds_ns.Skeleton = __ds_scope.Skeleton

  __ds_ns.Avatar = __ds_scope.Avatar

  __ds_ns.AvatarImage = __ds_scope.AvatarImage

  __ds_ns.AvatarFallback = __ds_scope.AvatarFallback

  __ds_ns.Chart = __ds_scope.Chart

  __ds_ns.Form = __ds_scope.Form

  __ds_ns.FormItem = __ds_scope.FormItem

  __ds_ns.FormLabel = __ds_scope.FormLabel

  __ds_ns.FormControl = __ds_scope.FormControl

  __ds_ns.FormDescription = __ds_scope.FormDescription

  __ds_ns.FormMessage = __ds_scope.FormMessage

  __ds_ns.Input = __ds_scope.Input

  __ds_ns.Label = __ds_scope.Label

  __ds_ns.Textarea = __ds_scope.Textarea

  __ds_ns.Ajuda = __ds_scope.Ajuda

  __ds_ns.Command = __ds_scope.Command

  __ds_ns.CommandInput = __ds_scope.CommandInput

  __ds_ns.CommandList = __ds_scope.CommandList

  __ds_ns.CommandEmpty = __ds_scope.CommandEmpty

  __ds_ns.CommandGroup = __ds_scope.CommandGroup

  __ds_ns.CommandItem = __ds_scope.CommandItem

  __ds_ns.Dialog = __ds_scope.Dialog

  __ds_ns.DialogTrigger = __ds_scope.DialogTrigger

  __ds_ns.DialogClose = __ds_scope.DialogClose

  __ds_ns.DialogContent = __ds_scope.DialogContent

  __ds_ns.DialogHeader = __ds_scope.DialogHeader

  __ds_ns.DialogFooter = __ds_scope.DialogFooter

  __ds_ns.DialogTitle = __ds_scope.DialogTitle

  __ds_ns.DialogDescription = __ds_scope.DialogDescription

  __ds_ns.DropdownMenu = __ds_scope.DropdownMenu

  __ds_ns.DropdownMenuTrigger = __ds_scope.DropdownMenuTrigger

  __ds_ns.DropdownMenuContent = __ds_scope.DropdownMenuContent

  __ds_ns.DropdownMenuItem = __ds_scope.DropdownMenuItem

  __ds_ns.DropdownMenuSeparator = __ds_scope.DropdownMenuSeparator

  __ds_ns.DropdownMenuLabel = __ds_scope.DropdownMenuLabel

  __ds_ns.Sheet = __ds_scope.Sheet

  __ds_ns.SheetTrigger = __ds_scope.SheetTrigger

  __ds_ns.SheetClose = __ds_scope.SheetClose

  __ds_ns.SheetContent = __ds_scope.SheetContent

  __ds_ns.SheetHeader = __ds_scope.SheetHeader

  __ds_ns.SheetTitle = __ds_scope.SheetTitle

  __ds_ns.SheetDescription = __ds_scope.SheetDescription
})()
