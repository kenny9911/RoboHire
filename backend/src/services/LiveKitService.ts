import {
  RoomServiceClient,
  AccessToken,
  EgressClient,
  type VideoGrant,
  type EgressInfo,
} from 'livekit-server-sdk';
import { RoomAgentDispatch } from '@livekit/protocol';
import { EncodedFileOutput } from '@livekit/protocol';
import { logger } from './LoggerService.js';

// Convert wss:// to https:// for REST API calls
function getHttpUrl(wsUrl: string): string {
  return wsUrl.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://');
}

export class LiveKitService {
  private roomService!: RoomServiceClient;
  private egressClient!: EgressClient;
  private _url = '';
  private _apiKey = '';
  private _apiSecret = '';
  private _initialized = false;

  /** Read env vars lazily so dotenv has time to load them first. */
  private ensureInit() {
    if (this._initialized) return;
    this._url = process.env.LIVEKIT_URL || '';
    this._apiKey = process.env.LIVEKIT_API_KEY || '';
    this._apiSecret = process.env.LIVEKIT_API_SECRET || '';
    if (this._url && this._apiKey && this._apiSecret) {
      const httpUrl = getHttpUrl(this._url);
      this.roomService = new RoomServiceClient(httpUrl, this._apiKey, this._apiSecret);
      this.egressClient = new EgressClient(httpUrl, this._apiKey, this._apiSecret);
    }
    this._initialized = true;
  }

  /**
   * Create a LiveKit room for an interview.
   * Sets metadata with interview context so the agent can read it.
   */
  async createRoom(
    interviewId: string,
    metadata?: Record<string, unknown>,
    agentName?: string,
  ) {
    this.ensureInit();
    const roomName = `interview-${interviewId}`;

    const agents: RoomAgentDispatch[] = [];
    if (agentName) {
      agents.push(new RoomAgentDispatch({ agentName }));
    }

    const room = await this.roomService.createRoom({
      name: roomName,
      emptyTimeout: 300, // 5 min
      metadata: metadata ? JSON.stringify(metadata) : undefined,
      agents,
    });

    logger.info('LIVEKIT', `Room created: ${roomName}`, { interviewId });
    return room;
  }

  /**
   * Generate a LiveKit access token for a participant.
   */
  async generateToken(
    roomName: string,
    participantIdentity: string,
    participantName: string,
    options?: { isAgent?: boolean; metadata?: string },
  ): Promise<string> {
    this.ensureInit();
    const token = new AccessToken(this._apiKey, this._apiSecret, {
      identity: participantIdentity,
      name: participantName,
      ttl: '2h',
      metadata: options?.metadata,
    });

    const grant: VideoGrant = {
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    };

    if (options?.isAgent) {
      grant.roomAdmin = true;
      grant.agent = true;
    }

    token.addGrant(grant);
    return token.toJwt();
  }

  /**
   * Start room composite recording via Egress.
   * Records both audio and video to a file.
   */
  async startRecording(roomName: string): Promise<EgressInfo> {
    this.ensureInit();
    const fileOutput = new EncodedFileOutput({
      filepath: `interviews/${roomName}-{time}.mp4`,
    });

    const egress = await this.egressClient.startRoomCompositeEgress(
      roomName,
      fileOutput,
    );

    logger.info('LIVEKIT', `Recording started for room: ${roomName}`, {
      egressId: egress.egressId,
    });
    return egress;
  }

  /**
   * Stop an active recording.
   */
  async stopRecording(egressId: string): Promise<EgressInfo> {
    this.ensureInit();
    const egress = await this.egressClient.stopEgress(egressId);
    logger.info('LIVEKIT', `Recording stopped`, { egressId });
    return egress;
  }

  /**
   * Delete a room after interview ends.
   */
  async deleteRoom(roomName: string): Promise<void> {
    this.ensureInit();
    try {
      await this.roomService.deleteRoom(roomName);
      logger.info('LIVEKIT', `Room deleted: ${roomName}`);
    } catch (err: any) {
      logger.warn('LIVEKIT', `Failed to delete room: ${roomName}`, { error: err.message });
    }
  }

  /**
   * Update room metadata (e.g., to pass interview config to agent).
   */
  async updateRoomMetadata(roomName: string, metadata: Record<string, unknown>) {
    this.ensureInit();
    return this.roomService.updateRoomMetadata(roomName, JSON.stringify(metadata));
  }

  /**
   * List active egress recordings for a room.
   */
  async listRecordings(roomName: string): Promise<EgressInfo[]> {
    this.ensureInit();
    return this.egressClient.listEgress({ roomName });
  }

  /**
   * Check if LiveKit is configured.
   */
  isConfigured(): boolean {
    this.ensureInit();
    return !!(this._url && this._apiKey && this._apiSecret);
  }

  get wsUrl(): string {
    this.ensureInit();
    return this._url;
  }
}

export const liveKitService = new LiveKitService();
