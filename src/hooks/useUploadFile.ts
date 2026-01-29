import { useMutation } from "@tanstack/react-query";
import { BlossomUploader } from '@nostrify/nostrify/uploaders';
import { useAppContext } from "./useAppContext";
import { useCurrentUser } from "./useCurrentUser";

export function useUploadFile() {
  const { config } = useAppContext();
  const { user } = useCurrentUser();

  return useMutation({
    mutationFn: async (file: File) => {
      if (!user) {
        throw new Error('Must be logged in to upload files');
      }

      const storedRelays = config.siteConfig?.blossomRelays || [];
      const excludedRelays = config.siteConfig?.excludedBlossomRelays || [];
      const defaultRelay = config.siteConfig?.defaultRelay;

      const relays = [...storedRelays];
      if (defaultRelay) {
        let normalizedDefault = defaultRelay.replace(/\/$/, '');
        if (normalizedDefault.startsWith('wss://')) {
          normalizedDefault = normalizedDefault.replace('wss://', 'https://');
        } else if (normalizedDefault.startsWith('ws://')) {
          normalizedDefault = normalizedDefault.replace('ws://', 'http://');
        }

        const isExcluded = excludedRelays.includes(normalizedDefault);

        if ((normalizedDefault.startsWith('http://') || normalizedDefault.startsWith('https://')) && !relays.includes(normalizedDefault) && !isExcluded) {
          relays.unshift(normalizedDefault);
        }
      }

      const uploader = new BlossomUploader({
        servers: relays.length > 0 ? relays : ['https://blossom.primal.net/'],
        signer: user.signer,
      });

      const tags = await uploader.upload(file);
      return tags;
    },
  });
}