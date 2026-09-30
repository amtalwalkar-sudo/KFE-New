const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.kanishkaenterprises.com/v1'

export const apiAdapter = {
  async postRecord(record) {
    if (!import.meta.env.VITE_API_BASE_URL) {
      return { success: true, mock: true, entityId: record.entityId }
    }

    const response = await fetch(`${BASE_URL}/records/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record)
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const error = new Error(errorData.message || `Server error: ${response.status}`)
      error.status = response.status
      throw error
    }

    return await response.json()
  }
}
