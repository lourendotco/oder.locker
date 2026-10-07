import { useEffect, useState } from "react";
import type { Conversation, DiscussionSocket } from "./useDiscussionSocket";

const stop = (stream: MediaStream) =>
  stream.getTracks().forEach((track) => track.stop());

export function useMicrophone() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [refused, setRefused] = useState(false);

  useEffect(() => {
    let gone = false;
    let stream: MediaStream | undefined;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        return setRefused(true);
      }
      if (gone) return stop(stream);
      setStream(stream);
    })();
    return () => {
      gone = true;
      if (stream) stop(stream);
    };
  }, []);

  return { stream, refused };
}

// Resolves once the connection has its network candidates, or after a second:
// the SFU is publicly reachable, so the rest can be found on the way.
function candidatesGathered(pc: RTCPeerConnection) {
  return new Promise<void>((resolve) => {
    if (pc.iceGatheringState === "complete") return resolve();
    const timer = setTimeout(resolve, 1000);
    pc.addEventListener("icegatheringstatechange", () => {
      if (pc.iceGatheringState !== "complete") return;
      clearTimeout(timer);
      resolve();
    });
  });
}

/** The connection to the SFU: sends the microphone once there is a
    conversation and brings in the others'. The SDP goes over `socket`. */
export function useDiscussionAudio(
  stream: MediaStream | null,
  socket: DiscussionSocket,
) {
  // What the others are saying, one stream per participant.
  const [voices, setVoices] = useState<MediaStream[]>([]);
  const [muted, setMuted] = useState(false);
  const [failed, setFailed] = useState(false);

  const over = !!socket.over;

  useEffect(() => {
    if (!stream || over) return;
    let gone = false;
    let pc: RTCPeerConnection | undefined;
    // The connection to the SFU is up.
    let connected = false;
    // A pull is awaiting its offer or the server's "ready": one at a time.
    let pulling = false;
    // Whose microphones have been asked for, and who is there to ask.
    const pulled = new Set<number>();
    let latest: Conversation | undefined;

    const publish = async () => {
      pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }],
        bundlePolicy: "max-bundle",
      });
      pc.addEventListener("track", ({ track }) =>
        setVoices((voices) => [...voices, new MediaStream([track])]),
      );
      // Only now can the others pull this microphone, and this end pull
      // theirs: the SFU refuses both on a connection that isn't up.
      pc.addEventListener("connectionstatechange", () => {
        if (pc?.connectionState === "failed") setFailed(true);
        if (pc?.connectionState !== "connected" || connected) return;
        connected = true;
        socket.send({ type: "connected" });
        pull();
      });
      const transceiver = pc.addTransceiver(stream.getAudioTracks()[0], {
        direction: "sendonly",
      });
      await pc.setLocalDescription(await pc.createOffer());
      await candidatesGathered(pc);
      if (gone) return;
      socket.send({
        type: "publish",
        sdp: pc.localDescription!.sdp,
        mid: transceiver.mid!,
      });
    };

    // can i do all of this server side?
    // Asks for the microphones that have come up since the last time.
    const pull = () => {
      if (!connected || pulling || !latest) return;
      const ids = latest.participants
        .filter(({ id, live }) => live && id !== latest!.you && !pulled.has(id))
        .map(({ id }) => id);
      if (!ids.length) return;
      pulling = true;
      ids.forEach((id) => pulled.add(id));
      socket.send({ type: "pull", ids });
    };

    const unsubscribe = socket.subscribe(async (message) => {
      try {
        if (message.type === "state") {
          latest = message;
          if (!pc) await publish();
          pull();
        } else if (message.type === "published") {
          await pc!.setRemoteDescription({ type: "answer", sdp: message.sdp });
        } else if (message.type === "offer") {
          await pc!.setRemoteDescription({ type: "offer", sdp: message.sdp });
          await pc!.setLocalDescription(await pc!.createAnswer());
          socket.send({ type: "answer", sdp: pc!.localDescription!.sdp });
        } else if (message.type === "ready") {
          pulling = false;
          pull();
        } else if (message.type === "audio-failed") {
          setFailed(true);
        }
      } catch (e) {
        console.error(e);
        setFailed(true);
      }
    });

    return () => {
      gone = true;
      unsubscribe();
      pc?.close();
      setVoices([]);
    };
  }, [stream, over]);

  // The conversation is over: the microphone goes off with it.
  useEffect(() => {
    if (stream && over) stop(stream);
  }, [stream, over]);

  return {
    voices,
    muted,
    failed,
    toggleMute: () => {
      const track = stream?.getAudioTracks()[0];
      if (track) track.enabled = muted;
      setMuted(!muted);
    },
  };
}
