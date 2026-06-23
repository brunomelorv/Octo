import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'

export default function Layout() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--ice)] text-[var(--text)] transition-colors duration-200">
      {/* Sidebar navigation */}
      <Sidebar />

      {/* Main container */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Horizontal topbar */}
        <Header />

        {/* Dynamic page container */}
        <main className="flex-grow p-6 overflow-x-hidden overflow-y-auto bg-[var(--ice)] transition-colors duration-200">
          <div className="max-w-[1400px] mx-auto w-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
