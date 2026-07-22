import { buildApp } from './app.js';
import { dispatchDuePushReminders } from './modules/push-notifications/push-notification.service.js';
import { env } from './shared/env.js';

const app = buildApp();
const port = Number(process.env.PORT || env.PORT || 3333);
let dispatchingPushReminders = false;

async function runPushReminderDispatch() {
  if (dispatchingPushReminders) return;
  dispatchingPushReminders = true;
  try {
    const result = await dispatchDuePushReminders();
    if (result.messages > 0) {
      app.log.info({ result }, 'Push reminders dispatched');
    }
  } catch (error) {
    app.log.error(error, 'Could not dispatch push reminders');
  } finally {
    dispatchingPushReminders = false;
  }
}

app.listen({ port, host: '0.0.0.0' }).then(() => {
  setTimeout(runPushReminderDispatch, 10_000);
  setInterval(runPushReminderDispatch, 60_000);
}).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
