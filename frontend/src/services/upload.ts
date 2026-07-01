import api from './api'

export const uploadService = {
  uploadFacebookLeads: async (files: File[]) => {
    const formData = new FormData()
    files.forEach(file => formData.append('files', file))
    
    const response = await api.post('/upload/facebook', formData)
    return response.data
  },

  uploadPitchYesCalls: async (files: File[]) => {
    const formData = new FormData()
    files.forEach(file => formData.append('files', file))
    
    const response = await api.post('/upload/pitchyes', formData)
    return response.data
  },

  runBuildDatabase: async () => {
    const response = await api.post('/upload/run-build')
    return response.data
  }
}
