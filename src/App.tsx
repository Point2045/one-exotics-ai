import { Routes, Route } from 'react-router'
import Home from './pages/Home'
import Radar from './pages/Radar'
import Markets from './pages/Markets'
import Sold from './pages/Sold'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/radar" element={<Radar />} />
      <Route path="/markets" element={<Markets />} />
      <Route path="/sold" element={<Sold />} />
    </Routes>
  )
}
