import KitLoopLogo from './KitLoopLogo'
import { linkClick } from '../navigation'

export default function Brand({ small = false }: { small?: boolean }) {
  return <a className={small ? 'brand brand--small' : 'brand'} href="/" onClick={linkClick('/')} aria-label="KitLoop home">
    <KitLoopLogo /><span className="brand-name">KitLoop</span>
  </a>
}
