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
import audio.budi.app.data.BudiRepository
import audio.budi.app.data.JobStatus
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ProcessingViewModel @Inject constructor(
    private val repository: BudiRepository
) : ViewModel() {

    private val _jobs = MutableStateFlow<List<JobStatus>>(emptyList())
    val jobs: StateFlow<List<JobStatus>> = _jobs

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading

    private val _selectedFilter = MutableStateFlow<String?>(null)
    val selectedFilter: StateFlow<String?> = _selectedFilter

    init {
        loadJobs()
        startPolling()
    }

    fun loadJobs() {
        viewModelScope.launch {
            _isLoading.value = true
            try {
                _jobs.value = repository.getJobs(status = _selectedFilter.value)
            } catch (e: Exception) {
                // Handle error
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun setFilter(filter: String?) {
        _selectedFilter.value = filter
        loadJobs()
    }

    private fun startPolling() {
        viewModelScope.launch {
            while (true) {
                delay(5000) // Poll every 5 seconds
                try {
                    val currentJobs = _jobs.value
                    val hasActiveJobs = currentJobs.any {
                        it.status in listOf("pending", "processing")
                    }
                    if (hasActiveJobs) {
                        _jobs.value = repository.getJobs(status = _selectedFilter.value)
                    }
                } catch (e: Exception) {
                    // Ignore polling errors
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProcessingScreen(
    viewModel: ProcessingViewModel = hiltViewModel()
) {
    val jobs by viewModel.jobs.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()
    val selectedFilter by viewModel.selectedFilter.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Processing") },
                actions = {
                    IconButton(onClick = { viewModel.loadJobs() }) {
                        Icon(Icons.Default.Refresh, "Refresh")
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            // Filter chips
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                FilterChip(
                    selected = selectedFilter == null,
                    onClick = { viewModel.setFilter(null) },
                    label = { Text("All") }
                )
                FilterChip(
                    selected = selectedFilter == "processing",
                    onClick = { viewModel.setFilter("processing") },
                    label = { Text("Active") }
                )
                FilterChip(
                    selected = selectedFilter == "completed",
                    onClick = { viewModel.setFilter("completed") },
                    label = { Text("Completed") }
                )
                FilterChip(
                    selected = selectedFilter == "failed",
                    onClick = { viewModel.setFilter("failed") },
                    label = { Text("Failed") }
                )
            }

            if (isLoading && jobs.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator()
                }
            } else if (jobs.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(
                            Icons.Default.CheckCircle,
                            contentDescription = null,
                            modifier = Modifier.size(64.dp),
                            tint = MaterialTheme.colorScheme.outline
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Text(
                            "No Jobs",
                            style = MaterialTheme.typography.titleLarge
                        )
                        Text(
                            "Processing jobs will appear here",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            } else {
                LazyColumn(
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(jobs) { job ->
                        JobCard(job = job)
                    }
                }
            }
        }
    }
}

@Composable
fun JobCard(job: JobStatus) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .padding(16.dp)
                .fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            JobTypeIcon(type = job.type)

            Spacer(modifier = Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = formatJobType(job.type),
                    style = MaterialTheme.typography.titleSmall
                )
                Text(
                    text = job.trackId ?: job.projectId ?: "Unknown",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1
                )
                if (job.error != null) {
                    Text(
                        text = job.error,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                        maxLines = 2
                    )
                }
            }

            when (job.status) {
                "processing" -> {
                    Column(horizontalAlignment = Alignment.End) {
                        CircularProgressIndicator(
                            progress = { job.progress / 100f },
                            modifier = Modifier.size(32.dp),
                            strokeWidth = 3.dp
                        )
                        Text(
                            "${job.progress}%",
                            style = MaterialTheme.typography.labelSmall
                        )
                    }
                }
                "completed" -> {
                    Icon(
                        Icons.Default.CheckCircle,
                        contentDescription = "Completed",
                        tint = MaterialTheme.colorScheme.primary
                    )
                }
                "failed" -> {
                    Icon(
                        Icons.Default.Error,
                        contentDescription = "Failed",
                        tint = MaterialTheme.colorScheme.error
                    )
                }
                else -> {
                    Icon(
                        Icons.Default.Schedule,
                        contentDescription = "Pending",
                        tint = MaterialTheme.colorScheme.outline
                    )
                }
            }
        }
    }
}

@Composable
fun JobTypeIcon(type: String) {
    val icon = when (type) {
        "analyze" -> Icons.Default.Analytics
        "fix" -> Icons.Default.Build
        "master" -> Icons.Default.Tune
        "codec_preview" -> Icons.Default.Headphones
        "album_master" -> Icons.Default.Album
        "export" -> Icons.Default.Download
        else -> Icons.Default.Work
    }

    Icon(
        imageVector = icon,
        contentDescription = null,
        tint = MaterialTheme.colorScheme.primary,
        modifier = Modifier.size(32.dp)
    )
}

private fun formatJobType(type: String): String {
    return when (type) {
        "analyze" -> "Audio Analysis"
        "fix" -> "Fix Issues"
        "master" -> "Mastering"
        "codec_preview" -> "Codec Preview"
        "album_master" -> "Album Master"
        "export" -> "Export"
        else -> type.replaceFirstChar { it.uppercase() }
    }
}
