import notificationClip from '../assets/notification.wav';


let sharedNotificationAudio = null;


const getNotificationAudio = () => {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') {
    return null;
  }

  if (!sharedNotificationAudio) {
    sharedNotificationAudio = new Audio(notificationClip);
    sharedNotificationAudio.preload = 'auto';
  }

  return sharedNotificationAudio;
};


export const primeBrowserAudio = async () => {
  const audio = getNotificationAudio();
  if (!audio) {
    return false;
  }

  try {
    audio.pause();
    audio.currentTime = 0;
    audio.muted = true;
    await audio.play();
    audio.pause();
    audio.currentTime = 0;
    audio.muted = false;
    return true;
  } catch (error) {
    audio.pause();
    audio.currentTime = 0;
    audio.muted = false;
    return false;
  }
};


export const playBrowserCompletionChime = async () => {
  const audio = getNotificationAudio();
  if (!audio) {
    return false;
  }

  try {
    audio.pause();
    audio.currentTime = 0;
    audio.muted = false;
    await audio.play();
    return true;
  } catch (error) {
    audio.pause();
    audio.currentTime = 0;
    return false;
  }
};
