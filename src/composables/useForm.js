import { ref, reactive, toRaw } from 'vue'

/**
 * Standardized form state management composable.
 * @param {Object} initialState - Initial fields and values for the form.
 * @param {Function|null} submitFn - Optional default submit handler function.
 */
export function useForm(initialState = {}, submitFn = null) {
  const form = reactive({ ...initialState })
  const busy = ref(false)
  const error = ref('')
  const errors = reactive({})
  const success = ref('')

  function reset() {
    Object.assign(form, JSON.parse(JSON.stringify(initialState)))
    error.value = ''
    success.value = ''
    Object.keys(errors).forEach(key => delete errors[key])
  }

  function clearErrors() {
    error.value = ''
    Object.keys(errors).forEach(key => delete errors[key])
  }

  function setError(fieldOrMsg, msg) {
    if (msg) {
      errors[fieldOrMsg] = msg
    } else {
      error.value = String(fieldOrMsg)
    }
  }

  async function submit(customSubmitFn) {
    const fn = customSubmitFn || submitFn
    if (!fn || busy.value) return

    clearErrors()
    busy.value = true
    success.value = ''

    try {
      const result = await fn(toRaw(form))
      return result
    } catch (err) {
      error.value = String(err?.message || err)
      throw err
    } finally {
      busy.value = false
    }
  }

  return {
    form,
    busy,
    error,
    errors,
    success,
    reset,
    clearErrors,
    setError,
    submit
  }
}
