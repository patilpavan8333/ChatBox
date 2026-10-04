/* =========================================================
   CHATBOX - COMPLETE CHAT JAVASCRIPT
   ========================================================= */

/* =========================================================
   GLOBAL STATE
   ========================================================= */

let connection = null;

let currentUser = "";

let userStatuses = {
    Tom: false,
    Myauuu: false
};

/* =========================================================
   TWILIO STATE
   ========================================================= */

let twilioRoom = null;
let localTracks = [];
let twilioCallType = null;

/* =========================================================
   CALL STATE
   ========================================================= */

let currentCall = {
    active: false,
    type: null,
    otherUser: null,
    incoming: false,
    outgoing: false,
    roomName: null
};

/* =========================================================
   MESSAGE STATE
   ========================================================= */

const messagesById = new Map();

const selectedMessageIds = new Set();

let replyingToMessage = null;

let editingMessageId = null;

/* =========================================================
   CONFIGURATION
   ========================================================= */

const EDIT_TIME_LIMIT = 5 * 60 * 1000;

const LONG_PRESS_TIME = 500;

const SWIPE_REPLY_DISTANCE = 60;

const ALLOWED_REACTIONS = [
    "❤️",
    "😂",
    "😮",
    "😢",
    "😡",
    "👍"
];

/* =========================================================
   POINTER STATE
   ========================================================= */

let longPressTimer = null;

let pointerStartX = 0;
let pointerStartY = 0;

let pointerCurrentX = 0;
let pointerCurrentY = 0;

let longPressTriggered = false;

let swipeStarted = false;


/* =========================================================
   LOGIN
   ========================================================= */

async function login() {

    const passwordInput =
        document.getElementById("password");

    const errorElement =
        document.getElementById("loginError");

    if (!passwordInput)
        return;

    const password =
        passwordInput.value.trim();

    if (!password) {

        if (errorElement) {
            errorElement.textContent =
                "Please enter password.";
        }

        return;
    }

    try {

        const response =
            await fetch(
                "/api/login",
                {
                    method: "POST",
                    headers: {
                        "Content-Type":
                            "application/json"
                    },
                    body: JSON.stringify({
                        password: password
                    })
                }
            );

        if (!response.ok) {

            if (errorElement) {
                errorElement.textContent =
                    "Invalid password.";
            }

            return;
        }

const meResponse =
    await fetch("/api/me");

if (meResponse.ok) {

    const me =
        await meResponse.json();

    currentUser =
        me.userName ||
        me.user ||
        me.username ||
        "";
}
        if (!currentUser) {

            if (errorElement) {
                errorElement.textContent =
                    "Unable to identify user.";
            }

            return;
        }

        document.getElementById(
            "loginScreen"
        ).style.display = "none";

        document.getElementById(
            "chatScreen"
        ).style.display = "flex";

        if (errorElement) {
            errorElement.textContent = "";
        }

        await startChat();

        focusMessageInput();

    } catch (error) {

        console.error(
            "Login error:",
            error
        );

        if (errorElement) {
            errorElement.textContent =
                "Unable to connect to server.";
        }
    }
}


/* =========================================================
   CHECK EXISTING LOGIN
   ========================================================= */

async function checkExistingLogin() {

    try {

        const response =
            await fetch("/api/me");

        if (!response.ok)
            return;

        const result =
            await response.json();

        const user =
            result.userName || result.user ||
            result.username ||
            "";

        if (!user)
            return;

        currentUser =
            user;

        document.getElementById(
            "loginScreen"
        ).style.display = "none";

        document.getElementById(
            "chatScreen"
        ).style.display = "flex";

        await startChat();

        focusMessageInput();

    } catch (error) {

        console.log(
            "No existing login."
        );
    }
}


/* =========================================================
   START CHAT
   ========================================================= */

async function startChat() {

    if (connection) {
        return;
    }

    connection =
        new signalR.HubConnectionBuilder()
            .withUrl("/chatHub")
            .withAutomaticReconnect([
                0,
                2000,
                5000,
                10000,
                30000
            ])
            .build();


    /* =====================================================
       RECEIVE TEXT MESSAGE
       ===================================================== */

    connection.on(
        "ReceiveMessage",
        message => {

            /*
             * New backend sends an object.
             */

            addMessageObject(
                message
            );
        }
    );


    /* =====================================================
       RECEIVE IMAGE
       ===================================================== */

    connection.on(
        "ReceiveImage",
        message => {

            /*
             * New backend sends an object.
             */

            addMessageObject(
                message
            );
        }
    );


    /* =====================================================
       MESSAGE EDITED
       ===================================================== */

    connection.on(
        "MessageEdited",
        data => {

            if (!data)
                return;

            const id =
                Number(data.id);

            const message =
                messagesById.get(id);

            if (!message)
                return;

            /*
             * IMPORTANT:
             * sentAt is NOT changed.
             */

            message.messageText =
                data.messageText || "";

            message.editedAt =
                data.editedAt;

            renderExistingMessage(
                message
            );
        }
    );


    /* =====================================================
       MESSAGES DELETED
       ===================================================== */

    connection.on(
        "MessagesDeleted",
        deletedMessages => {

            if (!Array.isArray(deletedMessages))
                return;

            deletedMessages.forEach(
                deleted => {

                    const id =
                        Number(deleted.id);

                    const message =
                        messagesById.get(id);

                    if (!message)
                        return;

                    message.isDeleted =
                        true;

                    message.deletedAt =
                        deleted.deletedAt;

                    /*
                     * Keep SentAt unchanged.
                     */

                    message.messageText =
                        "";

                    renderExistingMessage(
                        message
                    );
                }
            );

            refreshSelectedMessageStyles();
            updateSelectionToolbar();
        }
    );


    /* =====================================================
       REACTION CHANGED
       ===================================================== */

    connection.on(
        "ReactionChanged",
        (
            messageId,
            userName,
            emoji
        ) => {

            const id =
                Number(messageId);

            const message =
                messagesById.get(id);

            if (!message)
                return;

            if (!Array.isArray(message.reactions)) {
                message.reactions = [];
            }

            /*
             * Remove existing reaction from this user.
             */

            message.reactions =
                message.reactions.filter(
                    reaction =>
                        reaction.user !==
                        userName
                );

            /*
             * Add new reaction if not null.
             */

            if (emoji) {

                message.reactions.push({
                    user: userName,
                    emoji: emoji,
                    createdAt:
                        new Date().toISOString()
                });
            }

            renderExistingMessage(
                message
            );
        }
    );


    /* =====================================================
       MESSAGE STATUS UPDATED
       ===================================================== */

    connection.on(
        "MessageStatusUpdated",
        updates => {

            if (!Array.isArray(updates))
                return;

            updates.forEach(
                update => {

                    const id =
                        Number(update.id);

                    const message =
                        messagesById.get(id);

                    if (!message)
                        return;

                    message.deliveredAt =
                        update.deliveredAt;

                    message.seenAt =
                        update.seenAt;

                    renderExistingMessage(
                        message
                    );
                }
            );
        }
    );


/* =====================================================
   USER ONLINE / OFFLINE
   ===================================================== */

connection.on(
    "UserStatusChanged",
    (
        userName,
        isOnline
    ) => {

        userStatuses[userName] =
            isOnline;

        updateUserStatus(
            userName,
            isOnline
        );
    }
);

    /* =====================================================
       INCOMING CALL
       ===================================================== */

    connection.on(
        "IncomingCall",
        (
            caller,
            callType,
            roomName
        ) => {

            console.log(
                "Incoming call:",
                caller,
                callType,
                roomName
            );

            showIncomingCall(
                caller,
                callType,
                roomName
            );
        }
    );


    /* =====================================================
       CALL ACCEPTED
       ===================================================== */

    connection.on(
        "CallAccepted",
        async (
            receiver,
            callType,
            roomName
        ) => {

            console.log(
                "Call accepted by:",
                receiver,
                callType,
                roomName
            );

            if (!currentCall) {
                return;
            }

            try {

                currentCall.active =
                    true;

                currentCall.outgoing =
                    true;

                currentCall.otherUser =
                    receiver;

                currentCall.type =
                    callType;

                currentCall.roomName =
                    roomName;

                updateCallStatus(
                    "Connecting..."
                );

                await connectTwilioCall(
                    callType,
                    roomName
                );

            } catch (error) {

                console.error(
                    "Twilio call connection error:",
                    error
                );

                updateCallStatus(
                    "Connection failed"
                );

                cleanupTwilioCall();
            }
        }
    );


    /* =====================================================
       CALL REJECTED
       ===================================================== */

    connection.on(
        "CallRejected",
        userName => {

            updateCallStatus(
                `${userName} rejected the call`
            );

            cleanupTwilioCall();

            setTimeout(
                closeCallScreen,
                1500
            );
        }
    );


    /* =====================================================
       CALL ENDED
       ===================================================== */

    connection.on(
        "CallEnded",
        userName => {

            updateCallStatus(
                `${userName} ended the call`
            );

            cleanupTwilioCall();

            setTimeout(
                closeCallScreen,
                1000
            );
        }
    );


    /* =====================================================
       RECONNECTING
       ===================================================== */

    connection.onreconnecting(
        () => {

            const element =
                document.getElementById(
                    "connectionStatus"
                );

            if (element) {

                element.textContent =
                    "Reconnecting...";
            }
        }
    );


    /* =====================================================
       RECONNECTED
       ===================================================== */

    connection.onreconnected(
        async () => {

            const element =
                document.getElementById(
                    "connectionStatus"
                );

            if (element) {

                element.textContent =
                    "Connected";
            }

            try {

                await loadUserStatuses();

                await loadMessages();

                updateUserStatus(
                    currentUser,
                    true
                );

            } catch (error) {

                console.error(
                    "Reload after reconnect failed:",
                    error
                );
            }
        }
    );


    /* =====================================================
       CONNECTION CLOSED
       ===================================================== */

    connection.onclose(
        () => {

            const element =
                document.getElementById(
                    "connectionStatus"
                );

            if (element) {

                element.textContent =
                    "Disconnected";
            }
        }
    );


    /* =====================================================
       START SIGNALR
       ===================================================== */

    try {

        await connection.start();

        document.getElementById(
            "connectionStatus"
        ).textContent =
            "Connected";

        await loadUserStatuses();

        await loadMessages();

        updateUserStatus(
            currentUser,
            true
        );

    } catch (error) {

        console.error(
            "SignalR start error:",
            error
        );

        document.getElementById(
            "connectionStatus"
        ).textContent =
            "Connection failed";
    }
}


/* =========================================================
   USER HELPERS
   ========================================================= */

function getOtherUser() {

    return currentUser === "Tom"
        ? "Myauuu"
        : "Tom";
}


/* =========================================================
   USER STATUS
   ========================================================= */

async function loadUserStatuses() {

    try {

        const response =
            await fetch(
                "/api/status"
            );

        if (!response.ok)
            return;

        const status =
            await response.json();

        userStatuses.Tom =
            status.tom ??
            status.Tom ??
            false;

        userStatuses.Myauuu =
            status.myauuu ??
            status.Myauuu ??
            false;

        const otherUser =
            getOtherUser();

        updateUserStatus(
            otherUser,
            userStatuses[otherUser]
        );

    } catch (error) {

        console.error(
            "Status load error:",
            error
        );
    }
}


function updateUserStatus(
    userName,
    isOnline
) {

    const statusElement =
        document.getElementById(
            "otherStatus"
        );

    if (!statusElement)
        return;

    if (userName === currentUser)
        return;

    if (isOnline) {

        statusElement.textContent =
            "🟢 Online";

        statusElement.className =
            "online";

    } else {

        statusElement.textContent =
            "⚫ Offline";

        statusElement.className =
            "offline";
    }

    updateCallButtons();
}


/* =========================================================
   CALL BUTTON STATE
   ========================================================= */

function updateCallButtons() {

    const voiceButton =
        document.getElementById(
            "voiceCallButton"
        );

    const videoButton =
        document.getElementById(
            "videoCallButton"
        );

    if (!voiceButton || !videoButton)
        return;

    const otherUser =
        getOtherUser();

    const online =
        userStatuses[otherUser];

    const disabled =
        !online ||
        currentCall.active;

    voiceButton.disabled =
        disabled;

    videoButton.disabled =
        disabled;
}


/* =========================================================
   START VOICE CALL
   ========================================================= */

async function startVoiceCall() {

    await startCall("voice");
}


/* =========================================================
   START VIDEO CALL
   ========================================================= */

async function startVideoCall() {

    await startCall("video");
}


/* =========================================================
   START CALL
   ========================================================= */

async function startCall(callType) {

    const targetUser =
        getOtherUser();

    try {

        const roomName =
            "PrivateChat-" +
            [currentUser, targetUser]
                .sort()
                .join("-");

        currentCall = {

            active: false,

            type: callType,

            otherUser: targetUser,

            incoming: false,

            outgoing: true,

            roomName: roomName
        };

        showActiveCall(
            targetUser,
            callType
        );

        updateCallStatus(
            "Calling..."
        );

        await connection.invoke(
            "CallUser",
            targetUser,
            callType,
            roomName
        );

    } catch (error) {

        console.error(
            "Start call error:",
            error
        );

        alert(
            "Unable to start call: " +
            error.message
        );

        cleanupTwilioCall();

        closeCallScreen();
    }
}


/* =========================================================
   INCOMING CALL
   ========================================================= */

function showIncomingCall(
    caller,
    callType,
    roomName
) {

    currentCall = {

        active: false,

        type: callType,

        otherUser: caller,

        incoming: true,

        outgoing: false,

        roomName: roomName
    };

    const popup =
        document.getElementById(
            "incomingCallPopup"
        );

    if (!popup)
        return;

    document.getElementById(
        "incomingCaller"
    ).textContent =
        `${caller} is calling`;

    document.getElementById(
        "incomingCallType"
    ).textContent =
        callType === "video"
            ? "📹 Video call"
            : "☎️ Voice call";

    popup.style.display =
        "flex";
}


/* =========================================================
   ACCEPT CALL
   ========================================================= */

async function acceptIncomingCall() {

    if (!connection || !currentCall)
        return;

    try {

        const caller =
            currentCall.otherUser;

        const callType =
            currentCall.type;

        const roomName =
            currentCall.roomName;

        if (!roomName) {

            throw new Error(
                "Twilio room name is missing."
            );
        }

        await connection.invoke(
            "AcceptCall",
            caller,
            callType,
            roomName
        );

        currentCall.active =
            true;

        currentCall.incoming =
            false;

        currentCall.outgoing =
            false;

        hideIncomingCall();

        showActiveCall(
            caller,
            callType
        );

        updateCallStatus(
            "Connecting..."
        );

        await connectTwilioCall(
            callType,
            roomName
        );

    } catch (error) {

        console.error(
            "Accept call error:",
            error
        );

        alert(
            "Unable to accept call: " +
            error.message
        );

        cleanupTwilioCall();

        hideIncomingCall();
    }
}


/* =========================================================
   REJECT CALL
   ========================================================= */

async function rejectIncomingCall() {

    if (!connection || !currentCall)
        return;

    try {

        await connection.invoke(
            "RejectCall",
            currentCall.otherUser
        );

    } catch (error) {

        console.error(
            "Reject call error:",
            error
        );
    }

    hideIncomingCall();

    currentCall = {

        active: false,

        type: null,

        otherUser: null,

        incoming: false,

        outgoing: false,

        roomName: null
    };

    updateCallButtons();
}


/* =========================================================
   HIDE INCOMING CALL
   ========================================================= */

function hideIncomingCall() {

    const popup =
        document.getElementById(
            "incomingCallPopup"
        );

    if (popup) {

        popup.style.display =
            "none";
    }
}


/* =========================================================
   ACTIVE CALL SCREEN
   ========================================================= */

function showActiveCall(
    userName,
    callType
) {

    const userElement =
        document.getElementById(
            "activeCallUser"
        );

    const statusElement =
        document.getElementById(
            "activeCallStatus"
        );

    const videoArea =
        document.getElementById(
            "videoArea"
        );

    const screen =
        document.getElementById(
            "activeCallScreen"
        );

    if (userElement) {
        userElement.textContent =
            userName;
    }

    if (statusElement) {

        statusElement.textContent =
            callType === "video"
                ? "📹 Video call"
                : "☎️ Voice call";
    }

    if (videoArea) {

        videoArea.style.display =
            callType === "video"
                ? "flex"
                : "none";
    }

    if (screen) {

        screen.style.display =
            "flex";
    }
}


/* =========================================================
   CALL STATUS
   ========================================================= */

function updateCallStatus(
    status
) {

    const element =
        document.getElementById(
            "activeCallStatus"
        );

    if (element) {

        element.textContent =
            status;
    }
}


/* =========================================================
   MUTE
   ========================================================= */

function toggleMute() {

    if (!twilioRoom)
        return;

    const button =
        document.getElementById(
            "muteButton"
        );

    if (!button)
        return;

    if (
        !button.textContent.includes(
            "Unmute"
        )
    ) {

        muteTwilioAudio();

        button.textContent =
            "🔊 Unmute";

    } else {

        unmuteTwilioAudio();

        button.textContent =
            "🔇 Mute";
    }
}


/* =========================================================
   CAMERA
   ========================================================= */

function toggleCamera() {

    if (!twilioRoom)
        return;

    const button =
        document.getElementById(
            "cameraButton"
        );

    if (!button)
        return;

    if (
        !button.textContent.includes(
            "Off"
        )
    ) {

        disableTwilioVideo();

        button.textContent =
            "📷 Camera Off";

    } else {

        enableTwilioVideo();

        button.textContent =
            "📷 Camera";
    }
}


/* =========================================================
   END CALL
   ========================================================= */

async function endCall() {

    if (!connection)
        return;

    try {

        if (currentCall.otherUser) {

            await connection.invoke(
                "EndCall",
                currentCall.otherUser
            );
        }

    } catch (error) {

        console.error(
            "End call error:",
            error
        );
    }

    cleanupTwilioCall();

    closeCallScreen();
}


/* =========================================================
   CLOSE CALL SCREEN
   ========================================================= */

function closeCallScreen() {

    const activeCallScreen =
        document.getElementById(
            "activeCallScreen"
        );

    if (activeCallScreen) {

        activeCallScreen.style.display =
            "none";
    }

    hideIncomingCall();

    currentCall = {

        active: false,

        type: null,

        otherUser: null,

        incoming: false,

        outgoing: false,

        roomName: null
    };

    const muteButton =
        document.getElementById(
            "muteButton"
        );

    const cameraButton =
        document.getElementById(
            "cameraButton"
        );

    if (muteButton) {

        muteButton.textContent =
            "🔇 Mute";
    }

    if (cameraButton) {

        cameraButton.textContent =
            "📷 Camera";
    }

    updateCallButtons();
}


/* =========================================================
   TWILIO TOKEN
   ========================================================= */

async function getTwilioToken() {

    const response =
        await fetch(
            "/api/call/token"
        );

    if (!response.ok) {

        throw new Error(
            "Unable to get Twilio token."
        );
    }

    return await response.json();
}


/* =========================================================
   TWILIO CONNECT
   ========================================================= */

async function connectTwilioCall(
    callType,
    roomName
) {

    try {

        twilioCallType =
            callType;

        updateCallStatus(
            "Requesting microphone..."
        );

        const tokenData =
            await getTwilioToken();

        const options = {

            name: roomName,

            audio: true,

            video:
                callType === "video"
        };

        twilioRoom =
            await Twilio.Video.connect(
                tokenData.token,
                options
            );

        console.log(
            "Connected to Twilio room:",
            roomName
        );

        currentCall.active =
            true;

        updateCallStatus(
            "Connected"
        );

        twilioRoom.localParticipant.tracks
            .forEach(
                publication => {

                    if (
                        publication.track
                    ) {

                        attachLocalTrack(
                            publication.track
                        );
                    }
                }
            );

        twilioRoom.participants
            .forEach(
                participant => {

                    subscribeToParticipant(
                        participant
                    );
                }
            );

        twilioRoom.on(
            "participantConnected",
            participant => {

                subscribeToParticipant(
                    participant
                );
            }
        );

        twilioRoom.on(
            "participantDisconnected",
            participant => {

                console.log(
                    "Participant disconnected:",
                    participant.identity
                );

                updateCallStatus(
                    "Call ended"
                );

                cleanupTwilioCall();

                setTimeout(
                    closeCallScreen,
                    1000
                );
            }
        );

        twilioRoom.on(
            "disconnected",
            () => {

                console.log(
                    "Disconnected from Twilio room"
                );
            }
        );

    } catch (error) {

        console.error(
            "Twilio connection error:",
            error
        );

        updateCallStatus(
            "Connection failed"
        );

        alert(
            "Unable to start the call.\n\n" +
            error.message
        );

        cleanupTwilioCall();
    }
}


/* =========================================================
   TWILIO PARTICIPANT
   ========================================================= */

function subscribeToParticipant(
    participant
) {

    participant.tracks
        .forEach(
            publication => {

                if (
                    publication.isSubscribed
                ) {

                    attachRemoteTrack(
                        publication.track
                    );
                }
            }
        );

    participant.on(
        "trackSubscribed",
        track => {

            attachRemoteTrack(
                track
            );
        }
    );

    participant.on(
        "trackUnsubscribed",
        track => {

            removeRemoteTrack(
                track
            );
        }
    );
}


/* =========================================================
   LOCAL TRACK
   ========================================================= */

function attachLocalTrack(
    track
) {

    const localVideo =
        document.getElementById(
            "localVideo"
        );

    if (!localVideo)
        return;

    if (
        track.kind === "video"
    ) {

        localVideo.srcObject =
            new MediaStream([
                track.mediaStreamTrack
            ]);

        localVideo.style.display =
            "block";
    }
}


/* =========================================================
   REMOTE TRACK
   ========================================================= */

function attachRemoteTrack(
    track
) {

    const remoteVideo =
        document.getElementById(
            "remoteVideo"
        );

    if (!remoteVideo)
        return;

    if (
        track.kind === "video"
    ) {

        remoteVideo.srcObject =
            new MediaStream([
                track.mediaStreamTrack
            ]);

        remoteVideo.style.display =
            "block";

        return;
    }

    if (
        track.kind === "audio"
    ) {

        const audioElement =
            document.createElement(
                "audio"
            );

        audioElement.autoplay =
            true;

        audioElement.playsInline =
            true;

        audioElement.srcObject =
            new MediaStream([
                track.mediaStreamTrack
            ]);

        audioElement.dataset.twilioAudio =
            "true";

        document.body.appendChild(
            audioElement
        );

        audioElement.play()
            .catch(
                error => {

                    console.log(
                        "Audio autoplay waiting:",
                        error
                    );
                }
            );
    }
}


/* =========================================================
   REMOVE REMOTE TRACK
   ========================================================= */

function removeRemoteTrack(
    track
) {

    const remoteVideo =
        document.getElementById(
            "remoteVideo"
        );

    if (
        remoteVideo &&
        track.kind === "video"
    ) {

        remoteVideo.srcObject =
            null;
    }
}


/* =========================================================
   MUTE TWILIO AUDIO
   ========================================================= */

function muteTwilioAudio() {

    if (!twilioRoom)
        return;

    twilioRoom.localParticipant
        .audioTracks
        .forEach(
            publication => {

                if (
                    publication.track
                ) {

                    publication.track.disable();
                }
            }
        );
}


/* =========================================================
   UNMUTE TWILIO AUDIO
   ========================================================= */

function unmuteTwilioAudio() {

    if (!twilioRoom)
        return;

    twilioRoom.localParticipant
        .audioTracks
        .forEach(
            publication => {

                if (
                    publication.track
                ) {

                    publication.track.enable();
                }
            }
        );
}


/* =========================================================
   DISABLE VIDEO
   ========================================================= */

function disableTwilioVideo() {

    if (!twilioRoom)
        return;

    twilioRoom.localParticipant
        .videoTracks
        .forEach(
            publication => {

                if (
                    publication.track
                ) {

                    publication.track.disable();
                }
            }
        );
}


/* =========================================================
   ENABLE VIDEO
   ========================================================= */

function enableTwilioVideo() {

    if (!twilioRoom)
        return;

    twilioRoom.localParticipant
        .videoTracks
        .forEach(
            publication => {

                if (
                    publication.track
                ) {

                    publication.track.enable();
                }
            }
        );
}


/* =========================================================
   CLEANUP TWILIO
   ========================================================= */

function cleanupTwilioCall() {

    if (twilioRoom) {

        try {

            twilioRoom.localParticipant.tracks
                .forEach(
                    publication => {

                        if (
                            publication.track
                        ) {

                            publication.track.stop();
                        }
                    }
                );

            twilioRoom.disconnect();

        } catch (error) {

            console.error(
                "Twilio cleanup error:",
                error
            );
        }

        twilioRoom =
            null;
    }

    localTracks.forEach(
        track => {

            try {

                track.stop();

            } catch (error) {

                console.log(error);
            }
        }
    );

    localTracks =
        [];

    const localVideo =
        document.getElementById(
            "localVideo"
        );

    const remoteVideo =
        document.getElementById(
            "remoteVideo"
        );

    if (localVideo) {

        localVideo.srcObject =
            null;

        localVideo.style.display =
            "none";
    }

    if (remoteVideo) {

        remoteVideo.srcObject =
            null;

        remoteVideo.style.display =
            "none";
    }

    document
        .querySelectorAll(
            'audio[data-twilio-audio="true"]'
        )
        .forEach(
            audio => {

                audio.pause();

                audio.srcObject =
                    null;

                audio.remove();
            }
        );

    twilioCallType =
        null;
}


/* =========================================================
   LOAD MESSAGES
   ========================================================= */

async function loadMessages() {

    try {

        const response =
            await fetch(
                "/api/messages"
            );

        if (!response.ok) {

            console.error(
                "Unable to load messages"
            );

            return;
        }

        const messages =
            await response.json();

        const container =
            document.getElementById(
                "messages"
            );

        if (!container)
            return;

        container.innerHTML =
            "";

        messagesById.clear();

        selectedMessageIds.clear();

        messages.forEach(
            message => {

                normalizeMessage(
                    message
                );

                messagesById.set(
                    message.id,
                    message
                );

                renderMessage(
                    message,
                    false
                );
            }
        );

        container.scrollTop =
            container.scrollHeight;

        updateSelectionToolbar();

        /*
         * Everything from the other user is marked
         * delivered + seen while chat is open.
         */

        const incomingIds =
            messages
                .filter(
                    message =>
                        message.sender !== currentUser &&
                        !message.isDeleted &&
                        !message.seenAt
                )
                .map(
                    message =>
                        message.id
                );

        if (
            incomingIds.length > 0
        ) {

            await markMessagesSeen(
                incomingIds
            );
        }

    } catch (error) {

        console.error(
            "Load messages error:",
            error
        );
    }
}


/* =========================================================
   NORMALIZE MESSAGE
   ========================================================= */

function normalizeMessage(
    message
) {

    if (!message)
        return;

    message.id =
        Number(message.id);

    message.sender =
        message.sender || "";

    message.messageText =
        message.messageText || "";

    message.messageType =
        message.messageType || "text";

    message.reactions =
        Array.isArray(message.reactions)
            ? message.reactions
            : [];

    message.isDeleted =
        Boolean(message.isDeleted);

    if (
        message.replyToMessageId !== null &&
        message.replyToMessageId !== undefined
    ) {

        message.replyToMessageId =
            Number(
                message.replyToMessageId
            );
    }
}


/* =========================================================
   ADD LIVE MESSAGE
   ========================================================= */

function addMessageObject(
    message
) {

    if (!message)
        return;

    normalizeMessage(
        message
    );

    if (
        !message.id
    ) {

        console.error(
            "Message has no ID:",
            message
        );

        return;
    }

    /*
     * Prevent duplicate messages.
     */

    if (
        messagesById.has(
            message.id
        )
    ) {

        const existing =
            messagesById.get(
                message.id
            );

        Object.assign(
            existing,
            message
        );

        renderExistingMessage(
            existing
        );

        return;
    }

    messagesById.set(
        message.id,
        message
    );

    renderMessage(
        message,
        true
    );

    /*
     * Incoming message:
     * immediately mark as seen because chat is open.
     */

    if (
        message.sender !== currentUser
    ) {

        markMessagesSeen([
            message.id
        ]);
    }
}


/* =========================================================
   RENDER EXISTING MESSAGE
   ========================================================= */

function renderExistingMessage(
    message
) {

    const oldRow =
        document.querySelector(
            `.message-row[data-message-id="${message.id}"]`
        );

    if (oldRow) {

        oldRow.remove();
    }

    renderMessage(
        message,
        false
    );

    refreshSelectedMessageStyles();
}


/* =========================================================
   RENDER MESSAGE
   ========================================================= */

function renderMessage(
    message,
    scrollToBottom
) {

    const container =
        document.getElementById(
            "messages"
        );

    if (!container)
        return;

    const row =
        document.createElement(
            "div"
        );

    row.className =
        "message-row " +
        (
            message.sender === currentUser
                ? "me"
                : "other"
        );

    row.dataset.messageId =
        message.id;


    const wrapper =
        document.createElement(
            "div"
        );

    wrapper.className =
        "message " +
        (
            message.sender === currentUser
                ? "me"
                : "other"
        );

    wrapper.dataset.messageId =
        message.id;


    if (
        selectedMessageIds.has(
            message.id
        )
    ) {

        wrapper.classList.add(
            "selected"
        );
    }


    /*
     * Message interactions.
     */

    attachMessageInteractions(
        wrapper,
        message
    );


    /*
     * Sender.
     */

    const name =
        document.createElement(
            "strong"
        );

    name.className =
        "message-sender";

    name.textContent =
        message.sender;

    wrapper.appendChild(
        name
    );


    /*
     * Reply preview inside message.
     */

    if (
        message.replyToMessageId
    ) {

        const reply =
            document.createElement(
                "div"
            );

        reply.className =
            "message-reply";

        reply.title =
            "Go to replied message";

        const replySender =
            document.createElement(
                "strong"
            );

        replySender.textContent =
            message.replySender ||
            "Message";

        const replyText =
            document.createElement(
                "span"
            );

        replyText.textContent =
            message.replyText ||
            "Message";

        reply.appendChild(
            replySender
        );

        reply.appendChild(
            replyText
        );

        reply.addEventListener(
            "click",
            event => {

                event.stopPropagation();

                scrollToMessage(
                    message.replyToMessageId
                );
            }
        );

        wrapper.appendChild(
            reply
        );
    }


    /*
     * Deleted message.
     */

    if (
        message.isDeleted
    ) {

        const deleted =
            document.createElement(
                "div"
            );

        deleted.className =
            "message-text deleted-message";

        deleted.textContent =
            "🚫 This message was deleted";

        wrapper.appendChild(
            deleted
        );
    }

    /*
     * Image message.
     */

    else if (
        message.messageType ===
        "image"
    ) {

        const image =
            document.createElement(
                "img"
            );

        image.className =
            "chat-image";

        image.src =
            "/api/images/" +
            encodeURIComponent(
                message.filePath || ""
            );

        image.alt =
            message.originalFileName ||
            "Image";

        image.loading =
            "lazy";

        image.addEventListener(
            "click",
            event => {

                if (
                    selectedMessageIds.size > 0
                ) {

                    event.preventDefault();

                    return;
                }

                window.open(
                    image.src,
                    "_blank"
                );
            }
        );

        wrapper.appendChild(
            image
        );
    }

    /*
     * Text message.
     */

    else {

        const text =
            document.createElement(
                "div"
            );

        text.className =
            "message-text";

        text.textContent =
            message.messageText || "";

        wrapper.appendChild(
            text
        );

        /*
         * Edited label.
         */

        if (
            message.editedAt
        ) {

            const edited =
                document.createElement(
                    "span"
                );

            edited.className =
                "edited-label";

            edited.textContent =
                "edited";

            wrapper.appendChild(
                edited
            );
        }
    }


    /*
     * Reactions.
     */

    appendReactions(
        wrapper,
        message
    );


    /*
     * Metadata.
     */

    const meta =
        document.createElement(
            "div"
        );

    meta.className =
        "message-meta";


    /*
     * FIXED ORIGINAL TIMESTAMP.
     *
     * This always uses sentAt.
     * Edit/Delete never changes sentAt.
     */

    const time =
        document.createElement(
            "span"
        );

    time.className =
        "message-time";

    time.textContent =
        formatMessageTime(
            message.sentAt
        );

    meta.appendChild(
        time
    );


    /*
     * Sent / delivered / seen.
     */

    if (
        message.sender === currentUser
    ) {

        const status =
            document.createElement(
                "span"
            );

        status.className =
            "message-status";

        if (
            message.seenAt
        ) {

            status.textContent =
                "✓✓";

            status.classList.add(
                "seen"
            );

        } else if (
            message.deliveredAt
        ) {

            status.textContent =
                "✓✓";

        } else {

            status.textContent =
                "✓";
        }

        meta.appendChild(
            status
        );
    }


    wrapper.appendChild(
        meta
    );

    row.appendChild(
        wrapper
    );

    container.appendChild(
        row
    );


    /*
     * Scroll only when already near bottom.
     */

    if (scrollToBottom) {

        const nearBottom =
            container.scrollHeight -
            container.scrollTop -
            container.clientHeight <
            220;

        if (nearBottom) {

            requestAnimationFrame(
                () => {

                    container.scrollTop =
                        container.scrollHeight;
                }
            );
        }
    }
}


/* =========================================================
   FORMAT FIXED MESSAGE TIME
   ========================================================= */

function formatMessageTime(
    sentAt
) {

    if (!sentAt)
        return "";

    const date =
        new Date(sentAt);

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return "";
    }

    return date.toLocaleString(
        "en-IN",
        {
            timeZone: "Asia/Kolkata",
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        }
    );
}


/* =========================================================
   REACTIONS
   ========================================================= */

function appendReactions(
    wrapper,
    message
) {

    if (
        !Array.isArray(
            message.reactions
        ) ||
        message.reactions.length === 0
    ) {

        return;
    }

    const reactionsContainer =
        document.createElement(
            "div"
        );

    reactionsContainer.className =
        "message-reactions";


    const groups =
        new Map();


    message.reactions.forEach(
        reaction => {

            if (
                !reaction ||
                !reaction.emoji
            ) {

                return;
            }

            if (
                !groups.has(
                    reaction.emoji
                )
            ) {

                groups.set(
                    reaction.emoji,
                    {
                        emoji:
                            reaction.emoji,
                        count: 0,
                        mine: false
                    }
                );
            }

            const group =
                groups.get(
                    reaction.emoji
                );

            group.count++;

            if (
                reaction.user ===
                currentUser
            ) {

                group.mine =
                    true;
            }
        }
    );


    groups.forEach(
        group => {

            const pill =
                document.createElement(
                    "button"
                );

            pill.type =
                "button";

            pill.className =
                "reaction-pill";

            if (group.mine) {

                pill.classList.add(
                    "mine"
                );
            }

            pill.textContent =
                group.emoji +
                (
                    group.count > 1
                        ? ` ${group.count}`
                        : ""
                );

            /*
             * Clicking your existing reaction toggles it.
             */

            pill.addEventListener(
                "click",
                event => {

                    event.stopPropagation();

                    reactToMessage(
                        message.id,
                        group.emoji
                    );
                }
            );

            reactionsContainer.appendChild(
                pill
            );
        }
    );


    wrapper.appendChild(
        reactionsContainer
    );
}


/* =========================================================
   REACT TO MESSAGE
   ========================================================= */

async function reactToMessage(
    messageId,
    emoji
) {

    if (
        !ALLOWED_REACTIONS.includes(
            emoji
        )
    ) {

        return;
    }

    if (!connection)
        return;

    try {

        await connection.invoke(
            "ReactToMessage",
            Number(messageId),
            emoji
        );

    } catch (error) {

        console.error(
            "Reaction error:",
            error
        );
    }
}


/* =========================================================
   MESSAGE INTERACTIONS
   ========================================================= */

function attachMessageInteractions(
    element,
    message
) {

    element.addEventListener(
        "pointerdown",
        event => {

            if (
                event.pointerType === "mouse" &&
                event.button !== 0
            ) {
                return;
            }

            if (
                selectedMessageIds.size > 0
            ) {
                return;
            }

            pointerStartX =
                event.clientX;

            pointerStartY =
                event.clientY;

            pointerCurrentX =
                event.clientX;

            pointerCurrentY =
                event.clientY;

            longPressTriggered =
                false;

            swipeStarted =
                false;

            clearTimeout(
                longPressTimer
            );

            longPressTimer =
                setTimeout(
                    () => {

                        longPressTriggered =
                            true;

                        selectMessage(
                            message.id,
                            true
                        );

                    },
                    LONG_PRESS_TIME
                );
        }
    );


    element.addEventListener(
        "pointermove",
        event => {

            pointerCurrentX =
                event.clientX;

            pointerCurrentY =
                event.clientY;

            const deltaX =
                pointerCurrentX -
                pointerStartX;

            const deltaY =
                pointerCurrentY -
                pointerStartY;

            /*
             * Cancel long press after movement.
             */

            if (
                Math.abs(deltaX) > 10 ||
                Math.abs(deltaY) > 10
            ) {

                clearTimeout(
                    longPressTimer
                );
            }

            /*
             * Swipe right to reply.
             */

            if (
                selectedMessageIds.size === 0 &&
                Math.abs(deltaX) >
                    Math.abs(deltaY) &&
                deltaX > 10
            ) {

                swipeStarted =
                    true;

                const distance =
                    Math.min(
                        deltaX,
                        75
                    );

                element.style.transform =
                    `translateX(${distance}px)`;
            }
        }
    );


    element.addEventListener(
        "pointerup",
        event => {

            clearTimeout(
                longPressTimer
            );

            element.style.transform =
                "";

            const deltaX =
                event.clientX -
                pointerStartX;

            const deltaY =
                event.clientY -
                pointerStartY;

            /*
             * Long press already handled
             * the message.
             */

            if (
                longPressTriggered
            ) {

                longPressTriggered =
                    false;

                swipeStarted =
                    false;

                return;
            }

            /*
             * Swipe right = reply.
             */

            if (
                swipeStarted &&
                deltaX >=
                    SWIPE_REPLY_DISTANCE &&
                Math.abs(deltaX) >
                    Math.abs(deltaY)
            ) {

                const replyId =
                    message.id;

                clearSelection();

                startReply(
                    replyId
                );

                swipeStarted =
                    false;

                return;
            }

            /*
             * Selection mode:
             * tap another message to select it.
             */

            if (
                selectedMessageIds.size > 0
            ) {

                toggleMessageSelection(
                    message.id
                );

                swipeStarted =
                    false;

                return;
            }

            swipeStarted =
                false;
        }
    );


    element.addEventListener(
        "pointercancel",
        () => {

            clearTimeout(
                longPressTimer
            );

            element.style.transform =
                "";

            longPressTriggered =
                false;

            swipeStarted =
                false;
        }
    );


    /*
     * Desktop right click = select
     * and show reaction picker.
     */

    element.addEventListener(
        "contextmenu",
        event => {

            event.preventDefault();

            selectMessage(
                message.id,
                true
            );
        }
    );
}


function selectMessage(
    messageId,
    showReactionBar
) {

    if (
        !messagesById.has(
            messageId
        )
    ) {

        return;
    }

    selectedMessageIds.add(
        Number(messageId)
    );

    updateSelectionToolbar();

    refreshSelectedMessageStyles();

    if (showReactionBar) {

        showReactionPicker();
    }
}


/* =========================================================
   TOGGLE MESSAGE SELECTION
   ========================================================= */

function toggleMessageSelection(
    messageId
) {

    const id =
        Number(messageId);

    if (
        selectedMessageIds.has(id)
    ) {

        selectedMessageIds.delete(id);

    } else {

        selectedMessageIds.add(id);
    }

    if (
        selectedMessageIds.size === 0
    ) {

        hideReactionPicker();
    }

    updateSelectionToolbar();

    refreshSelectedMessageStyles();
}


/* =========================================================
   SELECTED MESSAGE STYLES
   ========================================================= */

function refreshSelectedMessageStyles() {

    document
        .querySelectorAll(
            ".message-row[data-message-id]"
        )
        .forEach(
            row => {

                const id =
                    Number(
                        row.dataset.messageId
                    );

                row.classList.toggle(
                    "selected",
                    selectedMessageIds.has(id)
                );
            }
        );
}


/* =========================================================
   SELECTION TOOLBAR
   ========================================================= */

function updateSelectionToolbar() {

    const toolbar =
        document.getElementById(
            "selectionToolbar"
        );

    const countElement =
        document.getElementById(
            "selectionCount"
        );

    if (
        !toolbar ||
        !countElement
    ) {

        return;
    }


    const count =
        selectedMessageIds.size;


    if (count === 0) {

        toolbar.style.display =
            "none";

        hideReactionPicker();

        return;
    }


    toolbar.style.display =
        "flex";


    countElement.textContent =
        count === 1
            ? "1 selected"
            : `${count} selected`;


    const replyButton =
        document.getElementById(
            "selectionReplyButton"
        );

    const editButton =
        document.getElementById(
            "selectionEditButton"
        );

    const deleteButton =
        document.getElementById(
            "selectionDeleteButton"
        );


    const selectedMessages =
        Array.from(
            selectedMessageIds
        )
            .map(
                id =>
                    messagesById.get(id)
            )
            .filter(Boolean);


    /*
     * Reply only when one message is selected.
     */

    const canReply =
        selectedMessages.length === 1;


    if (replyButton) {

        replyButton.disabled =
            !canReply;

        replyButton.style.opacity =
            canReply
                ? "1"
                : ".35";
    }


    /*
     * Edit:
     * one own text message,
     * not deleted,
     * less than 5 minutes old.
     */

    let canEdit =
        false;

    if (
        selectedMessages.length === 1
    ) {

        const message =
            selectedMessages[0];

        canEdit =
            message.sender === currentUser &&
            message.messageType === "text" &&
            !message.isDeleted &&
            isWithinEditTime(
                message
            );
    }


    if (editButton) {

        editButton.disabled =
            !canEdit;

        editButton.style.opacity =
            canEdit
                ? "1"
                : ".35";
    }


    /*
     * Delete:
     * only own non-deleted messages.
     */

    const ownMessages =
        selectedMessages.filter(
            message =>
                message.sender === currentUser &&
                !message.isDeleted
        );


    const canDelete =
        ownMessages.length > 0;


    if (deleteButton) {

        deleteButton.disabled =
            !canDelete;

        deleteButton.style.opacity =
            canDelete
                ? "1"
                : ".35";
    }
}


/* =========================================================
   CLEAR SELECTION
   ========================================================= */

function clearSelection() {

    selectedMessageIds.clear();

    hideReactionPicker();

    updateSelectionToolbar();

    refreshSelectedMessageStyles();

    focusMessageInput();
}


/* =========================================================
   REACTION PICKER
   ========================================================= */

function showReactionPicker() {

    const bar =
        document.getElementById(
            "reactionPicker"
        );

    if (!bar)
        return;

    bar.style.display =
        "flex";

    /*
     * Position near selected message.
     */

    const selectedId =
        Array.from(
            selectedMessageIds
        )[0];

    const selectedElement =
        document.querySelector(
            `.message-row[data-message-id="${selectedId}"]`
        );

    if (
        selectedElement
    ) {

        const rect =
            selectedElement.getBoundingClientRect();

        const top =
            Math.max(
                60,
                rect.top - 55
            );

        bar.style.top =
            `${top}px`;
    }
}


function hideReactionPicker() {

    const bar =
        document.getElementById(
            "reactionPicker"
        );

    if (!bar)
        return;

    bar.style.display =
        "none";
}


/* =========================================================
   REACT TO SELECTED MESSAGE
   ========================================================= */

async function reactSelectedMessage(
    emoji
) {

    if (
        !ALLOWED_REACTIONS.includes(
            emoji
        )
    ) {

        return;
    }


    const selected =
        Array.from(
            selectedMessageIds
        );


    if (
        selected.length !== 1
    ) {

        return;
    }


    await reactToMessage(
        selected[0],
        emoji
    );

    hideReactionPicker();
}


/* =========================================================
   REPLY
   ========================================================= */

function startReply(
    messageId
) {

    const message =
        messagesById.get(
            Number(messageId)
        );

    if (!message)
        return;


    replyingToMessage =
        message;

    editingMessageId =
        null;


    const preview =
        document.getElementById(
            "composerPreview"
        );

    const title =
        document.getElementById(
            "composerPreviewTitle"
        );

    const text =
        document.getElementById(
            "composerPreviewText"
        );


    if (
        !preview ||
        !title ||
        !text
    ) {

        return;
    }


    title.textContent =
        `Replying to ${message.sender}`;

    text.textContent =
        getMessagePreview(
            message
        );

    preview.style.display =
        "flex";


    updateEditUi();

    focusMessageInput();
}


/* =========================================================
   MESSAGE PREVIEW
   ========================================================= */

function getMessagePreview(
    message
) {

    if (!message)
        return "Message";


    if (
        message.isDeleted
    ) {

        return "This message was deleted";
    }


    if (
        message.messageType ===
        "image"
    ) {

        return "📷 Photo";
    }


    const text =
        message.messageText || "Message";


    return text.length > 100
        ? text.substring(0, 100) + "..."
        : text;
}


/* =========================================================
   CANCEL REPLY
   ========================================================= */

function cancelReply() {

    replyingToMessage =
        null;

    const preview =
        document.getElementById(
            "composerPreview"
        );

    if (
        preview &&
        !editingMessageId
    ) {

        preview.style.display =
            "none";
    }

    updateEditUi();

    focusMessageInput();
}


/* =========================================================
   EDIT TIME CHECK
   ========================================================= */

function isWithinEditTime(
    message
) {

    if (
        !message ||
        !message.sentAt
    ) {

        return false;
    }

    const sentTime =
        new Date(
            message.sentAt
        ).getTime();

    if (
        Number.isNaN(
            sentTime
        )
    ) {

        return false;
    }

    const age =
        Date.now() -
        sentTime;

    return (
        age >= 0 &&
        age <= EDIT_TIME_LIMIT
    );
}


/* =========================================================
   EDIT SELECTED MESSAGE
   ========================================================= */

function editSelectedMessage() {

    if (
        selectedMessageIds.size !== 1
    ) {

        return;
    }


    const messageId =
        Array.from(
            selectedMessageIds
        )[0];


    const message =
        messagesById.get(
            messageId
        );


    if (!message)
        return;


    if (
        message.sender !== currentUser ||
        message.messageType !== "text" ||
        message.isDeleted
    ) {

        return;
    }


    if (
        !isWithinEditTime(
            message
        )
    ) {

        alert(
            "You can edit a message only within 5 minutes after sending."
        );

        return;
    }


    editingMessageId =
        message.id;

    replyingToMessage =
        null;


    const input =
        document.getElementById(
            "messageInput"
        );

    if (!input)
        return;


    input.value =
        message.messageText;


    const preview =
        document.getElementById(
            "composerPreview"
        );

    const title =
        document.getElementById(
            "composerPreviewTitle"
        );

    const text =
        document.getElementById(
            "composerPreviewText"
        );


    if (
        preview &&
        title &&
        text
    ) {

        preview.style.display =
            "flex";

        title.textContent =
            "Editing message";

        text.textContent =
            "You can edit this message for 5 minutes.";
    }


    clearSelection();

    updateEditUi();

    focusMessageInput();
}


/* =========================================================
   UPDATE EDIT UI
   ========================================================= */

function updateEditUi() {

    const sendButton =
        document.getElementById(
            "sendButton"
        );

    const imageButton =
        document.getElementById(
            "imageButton"
        );

    const input =
        document.getElementById(
            "messageInput"
        );


    if (
        editingMessageId
    ) {

        if (sendButton) {

            sendButton.textContent =
                "✓";

            sendButton.title =
                "Save edit";
        }

        if (imageButton) {

            imageButton.disabled =
                true;

            imageButton.style.opacity =
                ".4";
        }

        if (input) {

            input.placeholder =
                "Edit message...";
        }

    } else {

        if (sendButton) {

            sendButton.textContent =
                "➤";

            sendButton.title =
                "Send";
        }

        if (imageButton) {

            imageButton.disabled =
                false;

            imageButton.style.opacity =
                "1";
        }

        if (input) {

            input.placeholder =
                "Type a message...";
        }
    }
}


/* =========================================================
   CANCEL EDIT
   ========================================================= */

function cancelEdit() {

    editingMessageId =
        null;

    replyingToMessage =
        null;

    const input =
        document.getElementById(
            "messageInput"
        );

    if (input) {

        input.value =
            "";

        input.placeholder =
            "Type a message...";
    }

    const preview =
        document.getElementById(
            "composerPreview"
        );

    if (preview) {

        preview.style.display =
            "none";
    }

    updateEditUi();

    focusMessageInput();
}


/* =========================================================
   DELETE SELECTED MESSAGES
   ========================================================= */

async function deleteSelectedMessages() {

    const selected =
        Array.from(
            selectedMessageIds
        );


    if (
        selected.length === 0
    ) {

        return;
    }


    const ownMessageIds =
        selected
            .map(
                id =>
                    messagesById.get(id)
            )
            .filter(
                message =>
                    message &&
                    message.sender === currentUser &&
                    !message.isDeleted
            )
            .map(
                message =>
                    message.id
            );


    if (
        ownMessageIds.length === 0
    ) {

        alert(
            "You can delete only your own messages."
        );

        return;
    }


    const confirmed =
        window.confirm(
            ownMessageIds.length === 1
                ? "Delete this message?"
                : `Delete ${ownMessageIds.length} selected messages?`
        );


    if (!confirmed)
        return;


    if (!connection)
        return;


    try {

        await connection.invoke(
            "DeleteMessages",
            ownMessageIds
        );

        selectedMessageIds.clear();

        hideReactionPicker();

        updateSelectionToolbar();

        refreshSelectedMessageStyles();

        focusMessageInput();

    } catch (error) {

        console.error(
            "Delete messages error:",
            error
        );

        alert(
            "Unable to delete messages: " +
            error.message
        );
    }
}


/* =========================================================
   SEND MESSAGE
   ========================================================= */

async function sendMessage() {

    const input =
        document.getElementById(
            "messageInput"
        );

    if (!input)
        return;


    const message =
        input.value.trim();


    if (!message)
        return;


    if (
        !connection ||
        connection.state !==
        signalR.HubConnectionState.Connected
    ) {

        return;
    }


    /*
     * EDIT
     */

    if (
        editingMessageId
    ) {

        const messageId =
            editingMessageId;

        /*
         * Client-side 5 minute check.
         * Backend also checks it.
         */

        const existing =
            messagesById.get(
                messageId
            );

        if (
            existing &&
            !isWithinEditTime(
                existing
            )
        ) {

            alert(
                "You can edit a message only within 5 minutes after sending."
            );

            return;
        }


        try {

            /*
             * Keep input focused.
             */

            input.focus();

            await connection.invoke(
                "EditMessage",
                messageId,
                message
            );

            editingMessageId =
                null;

            input.value =
                "";

            const preview =
                document.getElementById(
                    "composerPreview"
                );

            if (preview) {

                preview.style.display =
                    "none";
            }

            updateEditUi();

            focusMessageInput();

        } catch (error) {

            console.error(
                "Edit message error:",
                error
            );

            alert(
                "Unable to edit message: " +
                error.message
            );
        }

        return;
    }


    /*
     * REPLY
     */

    if (
        replyingToMessage
    ) {

        const replyId =
            replyingToMessage.id;

        try {

            input.focus();

            await connection.invoke(
                "SendReply",
                message,
                replyId
            );

            input.value =
                "";

            replyingToMessage =
                null;

            const preview =
                document.getElementById(
                    "composerPreview"
                );

            if (preview) {

                preview.style.display =
                    "none";
            }

            focusMessageInput();

        } catch (error) {

            console.error(
                "Reply message error:",
                error
            );

            alert(
                "Unable to send reply: " +
                error.message
            );
        }

        return;
    }


    /*
     * NORMAL MESSAGE
     */

    try {

        /*
         * Focus before invoking SignalR.
         * This helps keep mobile keyboard open.
         */

        input.focus();

        await connection.invoke(
            "SendMessage",
            message
        );

        input.value =
            "";

        requestAnimationFrame(
            () => {

                try {

                    input.focus({
                        preventScroll: true
                    });

                } catch {

                    input.focus();
                }
            }
        );

    } catch (error) {

        console.error(
            "Send message error:",
            error
        );
    }
}


/* =========================================================
   IMAGE SELECT
   ========================================================= */

function selectImage() {

    if (
        editingMessageId
    ) {

        return;
    }

    const input =
        document.getElementById(
            "imageInput"
        );

    if (input) {

        input.click();
    }
}


/* =========================================================
   IMAGE UPLOAD
   ========================================================= */

async function handleImageSelected(
    event
) {

    const input =
        event.target;

    if (
        !input.files ||
        input.files.length === 0
    ) {

        return;
    }


    const file =
        input.files[0];


    const allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/webp"
    ];


    if (
        !allowedTypes.includes(
            file.type
        )
    ) {

        alert(
            "Only JPG, PNG, and WEBP images are allowed."
        );

        input.value =
            "";

        return;
    }


    const maxSize =
        5 * 1024 * 1024;


    if (
        file.size >
        maxSize
    ) {

        alert(
            "Image must be 5 MB or smaller."
        );

        input.value =
            "";

        return;
    }


    if (
        !connection ||
        connection.state !==
        signalR.HubConnectionState.Connected
    ) {

        alert(
            "Chat connection is not ready."
        );

        input.value =
            "";

        return;
    }


    try {

        const formData =
            new FormData();

        formData.append(
            "file",
            file
        );


        const response =
            await fetch(
                "/api/upload-image",
                {
                    method: "POST",
                    body: formData
                }
            );


        if (!response.ok) {

            const errorText =
                await response.text();

            throw new Error(
                errorText ||
                "Image upload failed."
            );
        }


        const result =
            await response.json();


        /*
         * Current backend SendImage does not accept
         * ReplyToMessageId, so images are sent normally.
         */

        await connection.invoke(
            "SendImage",
            result.fileName,
            result.originalFileName
        );


        /*
         * Clear reply/edit mode after image.
         */

        replyingToMessage =
            null;

        editingMessageId =
            null;

        const preview =
            document.getElementById(
                "composerPreview"
            );

        if (preview) {

            preview.style.display =
                "none";
        }

        updateEditUi();

        focusMessageInput();

    } catch (error) {

        console.error(
            "Image upload error:",
            error
        );

        alert(
            "Unable to send image."
        );

    } finally {

        input.value =
            "";
    }
}


/* =========================================================
   MARK MESSAGES SEEN
   ========================================================= */

async function markMessagesSeen(
    messageIds
) {

    if (
        !connection ||
        connection.state !==
        signalR.HubConnectionState.Connected
    ) {

        return;
    }


    const ids =
        Array.from(
            new Set(
                messageIds
                    .map(
                        id =>
                            Number(id)
                    )
                    .filter(
                        id =>
                            Number.isFinite(id)
                    )
            )
        );


    if (
        ids.length === 0
    )
        return;


    try {

        await connection.invoke(
            "MarkMessagesSeen",
            ids
        );

    } catch (error) {

        console.error(
            "Mark seen error:",
            error
        );
    }
}


/* =========================================================
   MARK MESSAGES DELIVERED
   ========================================================= */

async function markMessagesDelivered(
    messageIds
) {

    if (
        !connection ||
        connection.state !==
        signalR.HubConnectionState.Connected
    ) {

        return;
    }


    const ids =
        Array.from(
            new Set(
                messageIds
                    .map(
                        id =>
                            Number(id)
                    )
                    .filter(
                        id =>
                            Number.isFinite(id)
                    )
            )
        );


    if (
        ids.length === 0
    )
        return;


    try {

        await connection.invoke(
            "MarkMessagesDelivered",
            ids
        );

    } catch (error) {

        console.error(
            "Mark delivered error:",
            error
        );
    }
}


/* =========================================================
   SCROLL TO MESSAGE
   ========================================================= */

function scrollToMessage(
    messageId
) {

    const element =
        document.querySelector(
            `.message[data-message-id="${messageId}"]`
        );

    if (!element)
        return;

    element.scrollIntoView({
        behavior: "smooth",
        block: "center"
    });

    element.classList.add(
        "reply-highlight"
    );

    setTimeout(
        () => {

            element.classList.remove(
                "reply-highlight"
            );

        },
        1200
    );
}


/* =========================================================
   FOCUS INPUT
   ========================================================= */

function focusMessageInput() {

    const input =
        document.getElementById(
            "messageInput"
        );

    if (!input)
        return;


    requestAnimationFrame(
        () => {

            try {

                input.focus({
                    preventScroll: true
                });

            } catch {

                input.focus();
            }
        }
    );
}


/* =========================================================
   DOM READY
   ========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        const sendButton =
            document.getElementById(
                "sendButton"
            );

        const messageInput =
            document.getElementById(
                "messageInput"
            );

        const closeSelectionButton =
            document.getElementById(
                "selectionCloseButton"
            );

        const replyButton =
            document.getElementById(
                "selectionReplyButton"
            );

        const editButton =
            document.getElementById(
                "selectionEditButton"
            );

        const deleteButton =
            document.getElementById(
                "selectionDeleteButton"
            );

        const cancelPreviewButton =
            document.getElementById(
                "cancelPreviewButton"
            );


        /* =================================================
           SEND BUTTON
           ================================================= */

        if (sendButton) {

            /*
             * Don't let mouse click steal keyboard focus.
             */

            sendButton.addEventListener(
                "mousedown",
                event => {

                    event.preventDefault();
                }
            );

            sendButton.addEventListener(
                "touchstart",
                () => {

                    if (messageInput) {

                        messageInput.focus({
                            preventScroll: true
                        });
                    }
                },
                {
                    passive: true
                }
            );
        }


        /* =================================================
           ENTER SEND
           ================================================= */

        if (messageInput) {

            messageInput.addEventListener(
                "keydown",
                event => {

                    if (
                        event.key === "Enter"
                    ) {

                        event.preventDefault();

                        sendMessage();
                    }
                }
            );
        }


        /* =================================================
           CLOSE SELECTION
           ================================================= */

        if (
            closeSelectionButton
        ) {

            closeSelectionButton.addEventListener(
                "click",
                () => {

                    clearSelection();
                }
            );
        }


        /* =================================================
           REPLY BUTTON
           ================================================= */

        if (replyButton) {

            replyButton.addEventListener(
                "click",
                () => {

                    if (
                        selectedMessageIds.size !== 1
                    ) {

                        return;
                    }

                    const id =
                        Array.from(
                            selectedMessageIds
                        )[0];

                    clearSelection();

                    startReply(id);
                }
            );
        }


        /* =================================================
           EDIT BUTTON
           ================================================= */

        if (editButton) {

            editButton.addEventListener(
                "click",
                () => {

                    editSelectedMessage();
                }
            );
        }


        /* =================================================
           DELETE BUTTON
           ================================================= */

        if (deleteButton) {

            deleteButton.addEventListener(
                "click",
                () => {

                    deleteSelectedMessages();
                }
            );
        }


        /* =================================================
           CANCEL REPLY / EDIT PREVIEW
           ================================================= */

        if (
            cancelPreviewButton
        ) {

            cancelPreviewButton.addEventListener(
                "click",
                () => {

                    if (
                        editingMessageId
                    ) {

                        cancelEdit();

                    } else {

                        cancelReply();
                    }
                }
            );
        }


        /* =================================================
           REACTION BUTTONS
           ================================================= */

        document
            .querySelectorAll(
                "#reactionPicker button[data-emoji]"
            )
            .forEach(
                button => {

                    button.addEventListener(
                        "click",
                        () => {

                            reactSelectedMessage(
                                button.dataset.emoji
                            );
                        }
                    );
                }
            );


        /* =================================================
           INITIAL UI
           ================================================= */

        updateEditUi();

        updateSelectionToolbar();


        /* =================================================
           VISIBILITY
           ================================================= */

        document.addEventListener(
            "visibilitychange",
            () => {

                if (
                    document.visibilityState ===
                    "visible"
                ) {

                    const incomingIds =
                        Array.from(
                            messagesById.values()
                        )
                            .filter(
                                message =>
                                    message.sender !==
                                        currentUser &&
                                    !message.isDeleted &&
                                    !message.seenAt
                            )
                            .map(
                                message =>
                                    message.id
                            );

                    if (
                        incomingIds.length > 0
                    ) {

                        markMessagesSeen(
                            incomingIds
                        );
                    }
                }
            }
        );



/*
 * Always show login page when the website is opened.
 */

// Do not automatically restore the previous login session.
// checkExistingLogin();
    }
);
