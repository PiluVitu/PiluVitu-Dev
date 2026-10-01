import { faArrowUpRightFromSquare } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

export function CreditoPiluTech({ onAbrir }: { onAbrir: () => void }) {
  return (
    <div className="flex flex-none justify-center border-t py-1.5 leading-[normal]">
      <button
        type="button"
        onClick={onAbrir}
        aria-label="Powered by PiluTech (abre pilutech.com.br)"
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex cursor-pointer items-center gap-1.5 rounded-sm px-1 font-mono text-[10.5px] font-medium transition-colors focus-visible:ring-1 focus-visible:outline-none"
      >
        Powered by PiluTech
        <FontAwesomeIcon
          icon={faArrowUpRightFromSquare}
          className="text-[9px]"
        />
      </button>
    </div>
  )
}
