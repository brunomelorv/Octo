import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { UploadCloud, CheckCircle, AlertCircle, Play, FileSpreadsheet, Loader2 } from 'lucide-react'
import { uploadService } from '../services/upload'
import { useAuth } from '../hooks/useAuth'

type UploadStatus = 'idle' | 'uploading' | 'success' | 'error'

export default function ImportarLeadsPage() {
  const { user } = useAuth()
  
  if (!['master', 'administrativo'].includes(user?.role || '')) {
    return <Navigate to="/dashboard" replace />
  }
  const [fbFiles, setFbFiles] = useState<File[]>([])
  const [fbStatus, setFbStatus] = useState<UploadStatus>('idle')
  const [fbMessage, setFbMessage] = useState('')

  const [pitchFiles, setPitchFiles] = useState<File[]>([])
  const [pitchStatus, setPitchStatus] = useState<UploadStatus>('idle')
  const [pitchMessage, setPitchMessage] = useState('')

  const [buildStatus, setBuildStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle')
  const [buildMessage, setBuildMessage] = useState('')

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDropFb = (e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFbFiles(Array.from(e.dataTransfer.files))
      setFbStatus('idle')
      setFbMessage('')
    }
  }

  const handleDropPitch = (e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setPitchFiles(Array.from(e.dataTransfer.files))
      setPitchStatus('idle')
      setPitchMessage('')
    }
  }

  const uploadFbFiles = async () => {
    if (fbFiles.length === 0) return
    setFbStatus('uploading')
    try {
      const res = await uploadService.uploadFacebookLeads(fbFiles)
      setFbStatus('success')
      setFbMessage(res.message)
    } catch (err: any) {
      setFbStatus('error')
      setFbMessage(err.response?.data?.detail || err.message || 'Erro ao fazer upload')
    }
  }

  const uploadPitchFiles = async () => {
    if (pitchFiles.length === 0) return
    setPitchStatus('uploading')
    try {
      const res = await uploadService.uploadPitchYesCalls(pitchFiles)
      setPitchStatus('success')
      setPitchMessage(res.message)
    } catch (err: any) {
      setPitchStatus('error')
      setPitchMessage(err.response?.data?.detail || err.message || 'Erro ao fazer upload')
    }
  }

  const runBuild = async () => {
    setBuildStatus('running')
    setBuildMessage('')
    try {
      const res = await uploadService.runBuildDatabase()
      setBuildStatus('success')
      setBuildMessage(res.message)
    } catch (err: any) {
      setBuildStatus('error')
      setBuildMessage(err.response?.data?.detail || err.message || 'Erro ao processar banco de dados')
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Importar Leads</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Facebook Upload Card */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-2 mb-4">
            <UploadCloud className="w-6 h-6 text-blue-600" />
            <h2 className="text-lg font-medium text-gray-900">Leads do Facebook (CSV)</h2>
          </div>
          
          <div 
            onDragOver={handleDragOver}
            onDrop={handleDropFb}
            className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:bg-gray-50 transition-colors"
          >
            <UploadCloud className="mx-auto h-12 w-12 text-gray-400" />
            <p className="mt-2 text-sm text-gray-600">Arraste e solte os arquivos CSV do Facebook aqui</p>
          </div>

          {fbFiles.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-gray-700">Arquivos selecionados:</h4>
              <ul className="mt-2 text-sm text-gray-600 space-y-1">
                {fbFiles.map((f, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-gray-400" />
                    {f.name}
                  </li>
                ))}
              </ul>
              <button
                onClick={uploadFbFiles}
                disabled={fbStatus === 'uploading'}
                className="mt-4 w-full flex justify-center items-center gap-2 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
              >
                {fbStatus === 'uploading' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Upload Leads Facebook'}
              </button>
            </div>
          )}

          {fbStatus === 'success' && (
            <div className="mt-4 p-3 bg-green-50 text-green-700 rounded-md flex items-center gap-2 text-sm">
              <CheckCircle className="w-4 h-4" />
              {fbMessage}
            </div>
          )}
          {fbStatus === 'error' && (
            <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-md flex items-center gap-2 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span className="break-all">{fbMessage}</span>
            </div>
          )}
        </div>

        {/* PitchYES Upload Card */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-2 mb-4">
            <UploadCloud className="w-6 h-6 text-indigo-600" />
            <h2 className="text-lg font-medium text-gray-900">Chamadas da PitchYES (Excel)</h2>
          </div>
          
          <div 
            onDragOver={handleDragOver}
            onDrop={handleDropPitch}
            className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:bg-gray-50 transition-colors"
          >
            <UploadCloud className="mx-auto h-12 w-12 text-gray-400" />
            <p className="mt-2 text-sm text-gray-600">Arraste e solte os arquivos Excel da PitchYES aqui</p>
          </div>

          {pitchFiles.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-gray-700">Arquivos selecionados:</h4>
              <ul className="mt-2 text-sm text-gray-600 space-y-1">
                {pitchFiles.map((f, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-gray-400" />
                    {f.name}
                  </li>
                ))}
              </ul>
              <button
                onClick={uploadPitchFiles}
                disabled={pitchStatus === 'uploading'}
                className="mt-4 w-full flex justify-center items-center gap-2 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
              >
                {pitchStatus === 'uploading' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Upload Chamadas PitchYES'}
              </button>
            </div>
          )}

          {pitchStatus === 'success' && (
            <div className="mt-4 p-3 bg-green-50 text-green-700 rounded-md flex items-center gap-2 text-sm">
              <CheckCircle className="w-4 h-4" />
              {pitchMessage}
            </div>
          )}
          {pitchStatus === 'error' && (
            <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-md flex items-center gap-2 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span className="break-all">{pitchMessage}</span>
            </div>
          )}
        </div>
      </div>

      {/* Build Database Section */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-2">Processamento da Base</h2>
        <p className="text-sm text-gray-500 mb-4">
          Após fazer o upload dos arquivos desejados, clique no botão abaixo para rodar o script de consolidação e atualizar a base de dados.
        </p>

        <button
          onClick={runBuild}
          disabled={buildStatus === 'running'}
          className="flex items-center gap-2 py-2 px-6 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 disabled:opacity-50"
        >
          {buildStatus === 'running' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          Inicializar Script build_database.py
        </button>

        {buildStatus === 'success' && (
          <div className="mt-4 p-3 bg-green-50 text-green-700 rounded-md flex items-center gap-2 text-sm">
            <CheckCircle className="w-4 h-4" />
            {buildMessage}
          </div>
        )}
        {buildStatus === 'error' && (
          <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-md flex items-start gap-2 text-sm overflow-auto">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <pre className="whitespace-pre-wrap break-all text-xs font-mono">{buildMessage}</pre>
          </div>
        )}
      </div>
    </div>
  )
}
