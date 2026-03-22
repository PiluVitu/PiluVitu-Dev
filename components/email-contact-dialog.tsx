'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { zodResolver } from '@hookform/resolvers/zod'
import axios from 'axios'
import { useState } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import ReCAPTCHA from 'react-google-recaptcha'
import { toast } from 'sonner'
import { z } from 'zod'

const formSchema = z.object({
  nome: z.string().min(2, {
    message: 'Username must be at least 2 characters.',
  }),
  email: z.string().email({ message: 'Email inválido' }),
  assunto: z.string().min(2, {
    message: 'O assunto deve ter no min 5 caracteres',
  }),
  mensagem: z.string().min(10, {
    message: 'O assunto deve ter no min 10 caracteres',
  }),
})

type EmailContactDialogProps = {
  /** Conteúdo do gatilho (ícone, texto); não uses `<button>` — o Trigger já é um botão. */
  children: React.ReactNode
  triggerClassName?: string
  triggerAriaLabel?: string
}

export function EmailContactDialog({
  children,
  triggerClassName,
  triggerAriaLabel,
}: EmailContactDialogProps) {
  const [captcha, setCaptcha] = useState(false)
  const [open, setOpen] = useState(false)

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nome: '',
      email: '',
      assunto: '',
      mensagem: '',
    },
  })

  const onSubmit = form.handleSubmit(
    async (values: z.infer<typeof formSchema>) => {
      setOpen(false)
      toast('✅ Muito obrigado por entrar em contato, irei retornar em breve')
      form.reset()
      axios
        .post(
          'https://formsubmit.co/ajax/pilutechinformatica@gmail.com',
          values,
          { headers: { 'Content-Type': 'application/json' } },
        )
        .then((response) => {
          console.log('✅ ', response)
        })
        .catch((error) => console.log('❌ ', error))
    },
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        type="button"
        className={triggerClassName}
        aria-label={triggerAriaLabel}
      >
        {children}
      </DialogTrigger>
      <DialogContent>
        <FormProvider {...form}>
          <form onSubmit={onSubmit} className="space-y-8">
            <FormField
              control={form.control}
              name="nome"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome</FormLabel>
                  <FormControl>
                    <Input placeholder="shadcn" {...field} />
                  </FormControl>
                  <FormDescription>
                    Insira como você gostaria de se indentificar
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="piruvato@gmail.com"
                      type="email"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Insira como você gostaria de se indentificar
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="assunto"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Assunto</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Gostaria de contratar seus serviços"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Escreva em poucas palavras o principal motivo de contato
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="mensagem"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mensagem</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Digite sua mensagem aqui"
                      {...field}
                      className="resize-none"
                    />
                  </FormControl>
                  <FormDescription>
                    Você pode discorrer sobre seu motivo de contato
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <ReCAPTCHA
              sitekey={process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY!}
              onChange={() => setCaptcha(true)}
              onError={() => setCaptcha(false)}
              onExpired={() => setCaptcha(false)}
            />
          </form>
        </FormProvider>
        <DialogFooter>
          <Button disabled={!captcha} type="submit" onClick={onSubmit}>
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
