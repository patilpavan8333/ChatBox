let twilioRoom = null;
let localTracks = [];
let twilioCallType = null;

let connection;
let currentUser = "";

let userStatuses = {
    Tom: false,
    Myauuu: false
};

let currentCall = {
    active: false,
    type: null,
    otherUser: null,
    incoming: false,
    outgoing: false,
    roomName: null
};


/* =========================
   LOGIN
   ========================= */

async function login() {

    const password =
        document.getElementById("password").value.trim();

    if (!password) {

        document.getElementById("loginError").textContent =
            "Enter password";

        return;
    }

    try {

        const formData = new FormData();

        formData.append(
            "password",
            password
        );

        const response =
            await fetch(
                "/api/login",
                {
                    method: "POST",
                    body: formData
                }
            );

        if (!response.ok) {

            document.getElementById("loginError").textContent =
                "Incorrect password";

            return;
        }

        document.getElementById("loginError").textContent =
            "";

        const meResponse =
            await fetch("/api/me");

        if (!meResponse.ok) {

            document.getElementById("loginError").textContent =
                "Unable to identify user";

            return;
        }

        const meData =
            await meResponse.json();

        currentUser =
            meData.userName;

        document.getElementById("loginScreen").style.display =
            "none";

        document.getElementById("chatScreen").style.display =
            "flex";

        await startChat();

    } catch (error) {

        console.error(error);

        document.getElementById("loginError").textContent =
            "Login failed";
    }
}


/* =========================
   START CHAT
   ========================= */

async function startChat() {

    connection =
        new signalR.HubConnectionBuilder()
            .withUrl("/chatHub")
            .withAutomaticReconnect()
            .build();


    /* =========================
       CHAT MESSAGE
       ========================= */

    connection.on(
        "ReceiveMessage",
        (
            sender,
            messageText,
            sentAt
        ) => {

            addMessage(
                sender,
                messageText,
                sentAt
            );
        }
    );


    /* =========================
       USER STATUS
       ========================= */

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


    connection.on(
        "CurrentUserStatuses",
        (status) => {

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
        }
    );


    /* =========================
       INCOMING CALL
       ========================= */

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


    /* =========================
       CALL ACCEPTED
       ========================= */

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


    /* =========================
       CALL REJECTED
       ========================= */

    connection.on(
        "CallRejected",
        (userName) => {

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


    /* =========================
       CALL ENDED
       ========================= */

    connection.on(
        "CallEnded",
        (userName) => {

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


    /* =========================
       SIGNALR RECONNECTING
       ========================= */

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


    /* =========================
       SIGNALR RECONNECTED
       ========================= */

    connection.onreconnected(
        () => {

            const element =
                document.getElementById(
                    "connectionStatus"
                );

            if (element) {
                element.textContent =
                    "Connected";
            }
        }
    );


    /* =========================
       SIGNALR CLOSED
       ========================= */

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

        console.error(error);

        document.getElementById(
            "connectionStatus"
        ).textContent =
            "Connection failed";
    }
}


/* =========================
   USER HELPERS
   ========================= */

function getOtherUser() {

    return currentUser === "Tom"
        ? "Myauuu"
        : "Tom";
}


/* =========================
   STATUS
   ========================= */

async function loadUserStatuses() {

    try {

        const response =
            await fetch("/api/status");

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

        console.error(error);
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


/* =========================
   CALL BUTTON STATE
   ========================= */

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


/* =========================
   START VOICE CALL
   ========================= */

async function startVoiceCall() {

    await startCall("voice");
}


/* =========================
   START VIDEO CALL
   ========================= */

async function startVideoCall() {

    await startCall("video");
}


/* =========================
   START CALL
   ========================= */

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


/* =========================
   INCOMING CALL
   ========================= */

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


/* =========================
   ACCEPT CALL
   ========================= */

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


/* =========================
   REJECT CALL
   ========================= */

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


/* =========================
   HIDE INCOMING CALL
   ========================= */

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


/* =========================
   ACTIVE CALL SCREEN
   ========================= */

function showActiveCall(
    userName,
    callType
) {

    document.getElementById(
        "activeCallUser"
    ).textContent =
        userName;

    document.getElementById(
        "activeCallStatus"
    ).textContent =
        callType === "video"
            ? "📹 Video call"
            : "☎️ Voice call";

    const videoArea =
        document.getElementById(
            "videoArea"
        );

    if (callType === "video") {

        videoArea.style.display =
            "flex";

    } else {

        videoArea.style.display =
            "none";
    }

    document.getElementById(
        "activeCallScreen"
    ).style.display =
        "flex";
}


/* =========================
   CALL STATUS
   ========================= */

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


/* =========================
   MUTE
   ========================= */

function toggleMute() {

    if (!twilioRoom) {
        return;
    }

    const button =
        document.getElementById(
            "muteButton"
        );

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


/* =========================
   CAMERA
   ========================= */

function toggleCamera() {

    if (!twilioRoom) {
        return;
    }

    const button =
        document.getElementById(
            "cameraButton"
        );

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


/* =========================
   END CALL
   ========================= */

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


/* =========================
   CLOSE CALL SCREEN
   ========================= */

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


/* =========================
   TWILIO TOKEN
   ========================= */

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


/* =========================
   TWILIO CONNECT
   ========================= */

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

        /* =========================
           LOCAL TRACKS
           ========================= */

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


        /* =========================
           EXISTING PARTICIPANTS
           ========================= */

        twilioRoom.participants
            .forEach(
                participant => {

                    subscribeToParticipant(
                        participant
                    );
                }
            );


        /* =========================
           NEW PARTICIPANT
           ========================= */

        twilioRoom.on(
            "participantConnected",
            participant => {

                console.log(
                    "Participant connected:",
                    participant.identity
                );

                subscribeToParticipant(
                    participant
                );
            }
        );


        /* =========================
           PARTICIPANT DISCONNECTED
           ========================= */

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


        /* =========================
           ROOM DISCONNECTED
           ========================= */

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


/* =========================
   TWILIO PARTICIPANT
   ========================= */

function subscribeToParticipant(
    participant
) {

    console.log(
        "Subscribing to participant:",
        participant.identity
    );


    /* Existing tracks */

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


    /* New tracks */

    participant.on(
        "trackSubscribed",
        track => {

            console.log(
                "Remote track subscribed:",
                track.kind
            );

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


/* =========================
   LOCAL TRACK
   ========================= */

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


/* =========================
   REMOTE TRACK
   ========================= */

function attachRemoteTrack(
    track
) {

    const remoteVideo =
        document.getElementById(
            "remoteVideo"
        );

    if (!remoteVideo)
        return;


    /* VIDEO */

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


    /* AUDIO */

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
                        "Audio autoplay waiting for user interaction:",
                        error
                    );
                }
            );
    }
}


/* =========================
   REMOVE REMOTE TRACK
   ========================= */

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


/* =========================
   MUTE TWILIO AUDIO
   ========================= */

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


/* =========================
   UNMUTE TWILIO AUDIO
   ========================= */

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


/* =========================
   DISABLE VIDEO
   ========================= */

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


/* =========================
   ENABLE VIDEO
   ========================= */

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


/* =========================
   CLEANUP TWILIO
   ========================= */

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


/* =========================
   LOAD MESSAGES
   ========================= */

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

        container.innerHTML =
            "";

        messages.forEach(
            message => {

                addMessage(
                    message.sender,
                    message.messageText,
                    message.sentAt
                );
            }
        );

        container.scrollTop =
            container.scrollHeight;

    } catch (error) {

        console.error(error);
    }
}


/* =========================
   SEND MESSAGE
   ========================= */

async function sendMessage() {

    const input =
        document.getElementById(
            "messageInput"
        );

    const message =
        input.value.trim();

    if (!message)
        return;

    if (!connection)
        return;

    if (
        connection.state !==
        signalR.HubConnectionState.Connected
    ) {

        return;
    }

    try {

        await connection.invoke(
            "SendMessage",
            message
        );

        input.value =
            "";

        input.focus();

    } catch (error) {

        console.error(error);
    }
}


/* =========================
   ADD MESSAGE
   ========================= */

function addMessage(
    sender,
    message,
    sentAt
) {

    const container =
        document.getElementById(
            "messages"
        );

    const wrapper =
        document.createElement(
            "div"
        );

    wrapper.className =
        sender === currentUser
            ? "message me"
            : "message other";

    const name =
        document.createElement(
            "strong"
        );

    name.textContent =
        sender;

    const text =
        document.createElement(
            "div"
        );

    text.textContent =
        message;

    const time =
        document.createElement(
            "small"
        );

    time.textContent =
        new Date(sentAt)
            .toLocaleString();

    wrapper.appendChild(
        name
    );

    wrapper.appendChild(
        text
    );

    wrapper.appendChild(
        time
    );

    container.appendChild(
        wrapper
    );

    container.scrollTop =
        container.scrollHeight;
}


/* =========================
   ENTER TO SEND
   ========================= */

const messageInput =
    document.getElementById(
        "messageInput"
    );

if (messageInput) {

    messageInput.addEventListener(
        "keydown",
        function(event) {

            if (event.key === "Enter") {

                event.preventDefault();

                sendMessage();
            }
        }
    );
}
