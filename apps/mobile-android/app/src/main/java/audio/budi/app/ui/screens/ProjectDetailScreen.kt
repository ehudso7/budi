package audio.budi.app.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import audio.budi.app.data.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ProjectDetailViewModel @Inject constructor(
    private val repository: BudiRepository
) : ViewModel() {

    private val _project = MutableStateFlow<Project?>(null)
    val project: StateFlow<Project?> = _project

    private val _tracks = MutableStateFlow<List<Track>>(emptyList())
    val tracks: StateFlow<List<Track>> = _tracks

    private val _selectedTrack = MutableStateFlow<Track?>(null)
    val selectedTrack: StateFlow<Track?> = _selectedTrack

    private val _analysis = MutableStateFlow<AnalysisReport?>(null)
    val analysis: StateFlow<AnalysisReport?> = _analysis

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading

    fun loadProject(projectId: String) {
        viewModelScope.launch {
            _isLoading.value = true
            try {
                _project.value = repository.getProject(projectId)
                _tracks.value = repository.getTracks(projectId)
            } catch (e: Exception) {
                // Handle error
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun selectTrack(track: Track) {
        _selectedTrack.value = track
        if (track.analysisReportId != null) {
            loadAnalysis(track.id)
        } else {
            _analysis.value = null
        }
    }

    private fun loadAnalysis(trackId: String) {
        viewModelScope.launch {
            try {
                _analysis.value = repository.getAnalysis(trackId)
            } catch (e: Exception) {
                _analysis.value = null
            }
        }
    }

    fun analyzeTrack(trackId: String) {
        viewModelScope.launch {
            try {
                repository.analyzeTrack(trackId)
                // Refresh tracks after starting analysis
                _project.value?.let { loadProject(it.id) }
            } catch (e: Exception) {
                // Handle error
            }
        }
    }

    fun masterTrack(trackId: String, profile: String, loudnessTarget: String) {
        viewModelScope.launch {
            try {
                repository.masterTrack(trackId, profile, loudnessTarget)
                _project.value?.let { loadProject(it.id) }
            } catch (e: Exception) {
                // Handle error
            }
        }
    }

    fun deleteTrack(trackId: String) {
        viewModelScope.launch {
            try {
                repository.deleteTrack(trackId)
                _tracks.value = _tracks.value.filter { it.id != trackId }
                if (_selectedTrack.value?.id == trackId) {
                    _selectedTrack.value = null
                    _analysis.value = null
                }
            } catch (e: Exception) {
                // Handle error
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProjectDetailScreen(
    projectId: String,
    onBack: () -> Unit,
    viewModel: ProjectDetailViewModel = hiltViewModel()
) {
    val project by viewModel.project.collectAsState()
    val tracks by viewModel.tracks.collectAsState()
    val selectedTrack by viewModel.selectedTrack.collectAsState()
    val analysis by viewModel.analysis.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()

    var showMasterDialog by remember { mutableStateOf(false) }

    LaunchedEffect(projectId) {
        viewModel.loadProject(projectId)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(project?.name ?: "Project") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, "Back")
                    }
                }
            )
        }
    ) { padding ->
        if (isLoading) {
            Box(
                modifier = Modifier.fillMaxSize().padding(padding),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator()
            }
        } else {
            Column(
                modifier = Modifier.fillMaxSize().padding(padding)
            ) {
                // Tracks list
                LazyColumn(
                    modifier = Modifier.weight(1f),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    if (tracks.isEmpty()) {
                        item {
                            Card(modifier = Modifier.fillMaxWidth()) {
                                Column(
                                    modifier = Modifier.padding(32.dp).fillMaxWidth(),
                                    horizontalAlignment = Alignment.CenterHorizontally
                                ) {
                                    Icon(
                                        Icons.Default.MusicNote,
                                        contentDescription = null,
                                        modifier = Modifier.size(48.dp),
                                        tint = MaterialTheme.colorScheme.outline
                                    )
                                    Spacer(modifier = Modifier.height(8.dp))
                                    Text("No tracks yet", style = MaterialTheme.typography.bodyLarge)
                                    Spacer(modifier = Modifier.height(4.dp))
                                    Text(
                                        "Upload audio files to get started",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                        }
                    }

                    items(tracks) { track ->
                        TrackCard(
                            track = track,
                            isSelected = selectedTrack?.id == track.id,
                            onClick = { viewModel.selectTrack(track) },
                            onAnalyze = { viewModel.analyzeTrack(track.id) },
                            onMaster = { showMasterDialog = true },
                            onDelete = { viewModel.deleteTrack(track.id) }
                        )
                    }
                }

                // Analysis panel
                selectedTrack?.let { track ->
                    AnalysisPanel(track = track, analysis = analysis)
                }
            }
        }
    }

    if (showMasterDialog && selectedTrack != null) {
        MasterDialog(
            onDismiss = { showMasterDialog = false },
            onMaster = { profile, target ->
                viewModel.masterTrack(selectedTrack!!.id, profile, target)
                showMasterDialog = false
            }
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TrackCard(
    track: Track,
    isSelected: Boolean,
    onClick: () -> Unit,
    onAnalyze: () -> Unit,
    onMaster: () -> Unit,
    onDelete: () -> Unit
) {
    var showMenu by remember { mutableStateOf(false) }

    Card(
        onClick = onClick,
        colors = CardDefaults.cardColors(
            containerColor = if (isSelected)
                MaterialTheme.colorScheme.primaryContainer
            else
                MaterialTheme.colorScheme.surface
        )
    ) {
        Row(
            modifier = Modifier.padding(16.dp).fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                Icons.Default.MusicNote,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary
            )

            Spacer(modifier = Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(track.name, style = MaterialTheme.typography.titleSmall)
                track.duration?.let { duration ->
                    Text(
                        formatDuration(duration),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            StatusChip(status = track.status)

            Box {
                IconButton(onClick = { showMenu = true }) {
                    Icon(Icons.Default.MoreVert, "More options")
                }

                DropdownMenu(
                    expanded = showMenu,
                    onDismissRequest = { showMenu = false }
                ) {
                    DropdownMenuItem(
                        text = { Text("Analyze") },
                        onClick = {
                            onAnalyze()
                            showMenu = false
                        },
                        leadingIcon = { Icon(Icons.Default.Analytics, null) }
                    )
                    DropdownMenuItem(
                        text = { Text("Master") },
                        onClick = {
                            onMaster()
                            showMenu = false
                        },
                        leadingIcon = { Icon(Icons.Default.Tune, null) },
                        enabled = track.analysisReportId != null
                    )
                    Divider()
                    DropdownMenuItem(
                        text = { Text("Delete") },
                        onClick = {
                            onDelete()
                            showMenu = false
                        },
                        leadingIcon = { Icon(Icons.Default.Delete, null) },
                        colors = MenuDefaults.itemColors(
                            textColor = MaterialTheme.colorScheme.error,
                            leadingIconColor = MaterialTheme.colorScheme.error
                        )
                    )
                }
            }
        }
    }
}

@Composable
fun AnalysisPanel(track: Track, analysis: AnalysisReport?) {
    Surface(
        color = MaterialTheme.colorScheme.surfaceVariant,
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                "Analysis",
                style = MaterialTheme.typography.titleMedium
            )

            Spacer(modifier = Modifier.height(12.dp))

            if (analysis != null) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    MetricItem(
                        label = "Loudness",
                        value = String.format("%.1f LUFS", analysis.integratedLufs)
                    )
                    MetricItem(
                        label = "True Peak",
                        value = String.format("%.1f dBTP", analysis.truePeak)
                    )
                    MetricItem(
                        label = "LRA",
                        value = String.format("%.1f LU", analysis.lra)
                    )
                    MetricItem(
                        label = "Clipping",
                        value = if (analysis.hasClipping) "${analysis.clipCount} clips" else "None",
                        isWarning = analysis.hasClipping
                    )
                }
            } else if (track.status == "uploaded") {
                Text(
                    "Track not yet analyzed",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            } else {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(16.dp),
                        strokeWidth = 2.dp
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        "Analyzing...",
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
            }
        }
    }
}

@Composable
fun MetricItem(label: String, value: String, isWarning: Boolean = false) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            value,
            style = MaterialTheme.typography.titleSmall,
            color = if (isWarning) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface
        )
        Text(
            label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
fun MasterDialog(
    onDismiss: () -> Unit,
    onMaster: (profile: String, loudnessTarget: String) -> Unit
) {
    var profile by remember { mutableStateOf("balanced") }
    var loudnessTarget by remember { mutableStateOf("streaming") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Master Track") },
        text = {
            Column {
                Text("Profile", style = MaterialTheme.typography.labelMedium)
                Spacer(modifier = Modifier.height(8.dp))

                listOf("gentle" to "Gentle", "balanced" to "Balanced", "aggressive" to "Aggressive").forEach { (value, label) ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        RadioButton(
                            selected = profile == value,
                            onClick = { profile = value }
                        )
                        Text(label)
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                Text("Loudness Target", style = MaterialTheme.typography.labelMedium)
                Spacer(modifier = Modifier.height(8.dp))

                listOf(
                    "streaming" to "Streaming (-14 LUFS)",
                    "cd" to "CD (-11 LUFS)",
                    "club" to "Club (-8 LUFS)"
                ).forEach { (value, label) ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        RadioButton(
                            selected = loudnessTarget == value,
                            onClick = { loudnessTarget = value }
                        )
                        Text(label)
                    }
                }
            }
        },
        confirmButton = {
            Button(onClick = { onMaster(profile, loudnessTarget) }) {
                Text("Master")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel")
            }
        }
    )
}

private fun formatDuration(seconds: Double): String {
    val mins = (seconds / 60).toInt()
    val secs = (seconds % 60).toInt()
    return "%d:%02d".format(mins, secs)
}
