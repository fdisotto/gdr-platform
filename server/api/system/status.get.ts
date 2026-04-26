import { useDb } from '~~/server/utils/db'
import {
  getSettingBoolean, getSettingString
} from '~~/server/services/system-settings'
import { toH3Error } from '~~/server/utils/http'

// Endpoint pubblico (no auth): permette al client di sapere se la
// piattaforma è in manutenzione e quali feature sono attive senza
// dover passare per /api/auth/me. Usato dal middleware client globale.
export default defineEventHandler(async (event) => {
  try {
    void event
    const db = useDb()
    return {
      maintenanceMode: getSettingBoolean(db, 'system.maintenanceMode', false),
      maintenanceMessage: getSettingString(
        db, 'system.maintenanceMessage', 'Manutenzione in corso. Torniamo presto.'
      ),
      registrationEnabled: getSettingBoolean(db, 'features.registrationEnabled', true),
      partyCreationEnabled: getSettingBoolean(db, 'features.partyCreationEnabled', true),
      voiceChatEnabled: getSettingBoolean(db, 'features.voiceChatEnabled', true),
      serverTime: Date.now()
    }
  } catch (e) {
    toH3Error(e)
  }
})
