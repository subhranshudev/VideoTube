import mongoose, { isValidObjectId } from "mongoose";
import { Playlist} from "../models/playlist.models.js"
import { asyncHandler } from "../utils/asynchandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";


const createPlaylist = asyncHandler( async (req, res) => {
    const {name, description} = req.body

    if (!name || !description) {
        throw new ApiError(400, "Name and Description are required to create a playlist")
    }

    const playList = await Playlist.create({
      name,
      description,
      owner: req.user?._id
    });

    const createdPlaylist = await Playlist.findById(playList._id);

    if (!createdPlaylist) {
      throw new ApiError(404, "Something went wrong while creating the playlist")
    }

    res.status(200).json( new ApiResponse(200, createdPlaylist, "playlist created successfully"))

})

const getUserPlaylists = asyncHandler( async (req, res) => {
  const {userId} = req.params
console.log(userId);

  if (!isValidObjectId(userId)) {
    throw new ApiError(400, "Unauthorized")
  }

  const allPlaylist = await Playlist.aggregate([
    {
      $match: {
        owner: new mongoose.Types.ObjectId(userId),
      },
    },
    {
      $lookup: {
        from: "videos",
        localField: "videos",
        foreignField: "_id",
        as: "videos"
      },
    },
   
  ]);
console.log(allPlaylist);

  if (allPlaylist.length === 0) {
    throw new ApiError(400, "No playlist found")
  }

  return res
    .status(200)
    .json(new ApiResponse(200, allPlaylist, "Playlists fetched successfully"));

})

const getPlaylistById = asyncHandler( async (req, res) => {
  const {playlistId} = req.params

  if (!isValidObjectId(playlistId)) {
    throw new ApiError(400, "invalid search")
  }

  const playList = await Playlist.findById(playlistId)
// TODO: add aggregation pipeline to replace the video ids by the corresponding video documents
  if (!playList) {
    throw new ApiError(404, "No playlist found")
  }

  return res.status(200).json( new ApiResponse(200, playList, "Playist fetched successfully"))


})

const addVideoToPlaylist = asyncHandler( async (req, res) => {
  const {playlistId, videoId} = req.params

  if (!isValidObjectId(playlistId)) {
    throw new ApiError(400, "invalid actions")
  }
  if (!isValidObjectId(videoId)) {
    throw new ApiError(400, "invalid actions");
  }

  // find the playlist
  const playList = await Playlist.findById(playlistId)
  if (!playList) {
    throw new ApiError(404, "Playlist not found")
  }

  //only the owner of playlist can add videos to the playlist
  if (playList?.owner.toString() !== req.user?._id.toString()) {
    throw new ApiError(402, "Only owner can add videos into the playlist")
  }

  const updatedPlaylist = await Playlist.findByIdAndUpdate(
    playlistId,
    {
      $addToSet: {
        videos: videoId
      },
    },
    { new: true }
  );

  if (!updatedPlaylist) {
    throw new ApiError(404, "Something went wrong while adding the videos into playlist")
  }

  return res.status(200).json( new ApiResponse(201, updatedPlaylist, "Video added to playlist successfully"))


})

const removeVideoFromPlaylist = asyncHandler( async (req, res) => {
  const { playlistId, videoId } = req.params;
  if (!isValidObjectId(playlistId)) {
    throw new ApiError(400, "invalid actions");
  }
  if (!isValidObjectId(videoId)) {
    throw new ApiError(400, "invalid actions");
  }

  // find the playlist
   const playList = await Playlist.findById(playlistId);
   if (!playList) {
     throw new ApiError(404, "Playlist not found");
   }

   //only the owner of playlist can remove videos from the playlist
   if (playList?.owner.toString() !== req.user?._id.toString()) {
     throw new ApiError(402, "Only owner can remove videos from the playlist");
   }

   // remove videos from playlist
   // remove the video id from the videos field(Array)
   const newVideos = playList?.videos?.filter( (dbVideoId) => dbVideoId.toString() !== videoId.toString() )
   console.log("newVideos: ", newVideos, "datatype: ",typeof(newVideos));

   const newPlaylist = await Playlist.findByIdAndUpdate(
     playlistId,
     {
       $set: {
         videos: newVideos
       },
     },
     { new: true }
   );

   if (!newPlaylist) {
    throw new ApiError(402, "Something went wrong while removing video")
   }

   return res.status(200).json( new ApiResponse(200, newPlaylist, "Video removed succesfully"))

})

const deletePlaylist = asyncHandler( async (req, res) => {
  const { playlistId } = req.params;

  if (!isValidObjectId(playlistId)) {
    throw new ApiError(400, "invalid actions");
  }

  // find the playlist
  const playList = await Playlist.findById(playlistId);
  if (!playList) {
    throw new ApiError(404, "Playlist not found");
  }

  //only the owner of playlist can delete the playlist
  if (playList?.owner.toString() !== req.user?._id.toString()) {
    throw new ApiError(402, "Only owner can delete the playlist");
  }

  await Playlist.findByIdAndDelete(playlistId)

  return res.status(200).json( new ApiResponse(200, {}, "Playlist deleted successfully"))

})

const updatePlaylist = asyncHandler( async (req, res) => {
   const { playlistId } = req.params;

   if (!isValidObjectId(playlistId)) {
     throw new ApiError(400, "invalid actions");
   }

   // find the playlist
   const playList = await Playlist.findById(playlistId);
   if (!playList) {
     throw new ApiError(404, "Playlist not found");
   }

   //only the owner of playlist can update the playlist
   if (playList?.owner.toString() !== req.user?._id.toString()) {
     throw new ApiError(402, "Only owner can update the playlist");
   }

   const { name, description } = req.body

   if (!name || !description) {
    throw new ApiError(400, "All fields are required")
   }

   const updatedPlaylist = await Playlist.findByIdAndUpdate(
    playlistId,
    {
      $set: {
        name,
        description
      }
    },
    {new: true}
   )

   if (!updatedPlaylist) {
    throw new ApiError(404, "Updation failed")
   }

   return res
     .status(200)
     .json(
       new ApiResponse(200, updatedPlaylist, "Playlist updated successfully")
     );


 

})


export {
  createPlaylist,
  getUserPlaylists,
  getPlaylistById,
  addVideoToPlaylist,
  removeVideoFromPlaylist,
  deletePlaylist,
  updatePlaylist,
};