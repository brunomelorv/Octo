import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'

export default function Layout() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--background)] text-[var(--text-primary)] transition-colors duration-150">
      {/* Sidebar navigation */}
      <Sidebar />

      {/* Main container */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Horizontal topbar */}
        <Header />

        {/* Dynamic page container */}
        <main className="flex-grow p-6 overflow-x-hidden overflow-y-auto bg-[var(--background)] transition-colors duration-150">
          <div className="max-w-[1400px] mx-auto w-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
