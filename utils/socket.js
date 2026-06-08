let _io = null

export const initSocket = (io) => { _io = io }
export const getIO = () => _io
