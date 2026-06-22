import React from 'react';
import Sidebar from '../components/Sidebar';
import AdminMisiones from '../components/AdminMisiones';

export default function AdminMisionesPage() {
  return (
    <div className="flex h-screen bg-[#09090b] overflow-hidden text-white">
      <Sidebar />
      <main className="flex-1 overflow-y-auto overflow-x-hidden p-6 md:p-12 relative z-0">
        <div className="absolute top-[-20%] left-[10%] w-[800px] h-[600px] bg-[#FFD700]/5 blur-[150px] pointer-events-none rounded-full mix-blend-screen"></div>
        <AdminMisiones />
      </main>
    </div>
  );
}
